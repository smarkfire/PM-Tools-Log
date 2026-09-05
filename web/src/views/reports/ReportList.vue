<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">报告中心</div>
      <div class="page-desc">使用 AI 基于工作日志生成个人/项目周报月报</div>
    </div>

    <!-- 生成入口 -->
    <el-card shadow="never" class="filter-card">
      <div class="generate-bar">
        <el-button type="primary" @click="showGenerateDialog('weekly')">
          <el-icon><Calendar /></el-icon>生成周报
        </el-button>
        <el-button type="primary" plain @click="showGenerateDialog('monthly')">
          <el-icon><Calendar /></el-icon>生成月报
        </el-button>
        <span class="generate-tip">个人报告随时可生成；项目报告需总监/项目经理权限</span>
      </div>
    </el-card>

    <!-- 报告列表 -->
    <el-card shadow="never" v-loading="loading">
      <template #header>
        <div class="list-header">
          <span>历史报告</span>
          <el-radio-group v-model="filterType" size="small" @change="loadReports">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="weekly">周报</el-radio-button>
            <el-radio-button value="monthly">月报</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <el-table v-if="!isMobile" :data="reports" stripe>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.type === 'weekly' ? 'primary' : 'warning'" size="small">
              {{ row.type === 'weekly' ? '周报' : '月报' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="范围" width="100">
          <template #default="{ row }">
            <el-tag :type="row.scope === 'project' ? 'danger' : 'success'" size="small" effect="light">
              {{ row.scope === 'project' ? '项目' : '个人' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="对象" min-width="140">
          <template #default="{ row }">
            {{ row.scope === 'project' ? row.project_name : (row.target_name || '我') }}
          </template>
        </el-table-column>
        <el-table-column label="周期" width="180">
          <template #default="{ row }">{{ row.period_start }} ~ {{ row.period_end }}</template>
        </el-table-column>
        <el-table-column prop="generator_name" label="生成人" width="100" />
        <el-table-column label="AI" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.ai_provider" size="small" :type="row.ai_provider === 'qwen' ? 'primary' : 'success'">
              {{ row.ai_provider === 'qwen' ? '千问' : 'DS' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生成时间" width="160">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewReport(row)">查看</el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 移动端卡片 -->
      <div v-else class="mobile-report-list">
        <div v-for="r in reports" :key="r.id" class="mobile-report-item" @click="viewReport(r)">
          <div class="report-top">
            <el-tag :type="r.type === 'weekly' ? 'primary' : 'warning'" size="small">
              {{ r.type === 'weekly' ? '周报' : '月报' }}
            </el-tag>
            <el-tag :type="r.scope === 'project' ? 'danger' : 'success'" size="small" effect="light">
              {{ r.scope === 'project' ? '项目' : '个人' }}
            </el-tag>
            <span class="report-time">{{ formatTime(r.created_at) }}</span>
          </div>
          <div class="report-subject">
            {{ r.scope === 'project' ? r.project_name : (r.target_name || '我') }}
          </div>
          <div class="report-period">{{ r.period_start }} ~ {{ r.period_end }}</div>
        </div>
        <el-empty v-if="!loading && reports.length === 0" description="暂无报告" />
      </div>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="loadReports"
        />
      </div>
    </el-card>

    <!-- 生成报告对话框 -->
    <el-dialog v-model="generateVisible" :title="`生成${typeLabel}`" :width="isMobile ? '92%' : '520px'">
      <el-form label-position="top">
        <el-form-item label="报告范围">
          <el-radio-group v-model="generateForm.scope">
            <el-radio-button value="personal">个人{{ typeLabel }}</el-radio-button>
            <el-radio-button value="project" :disabled="!canGenerateProject">项目{{ typeLabel }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="generateForm.scope === 'project'" label="选择项目">
          <el-select v-model="generateForm.projectId" placeholder="请选择项目" style="width: 100%">
            <el-option
              v-for="p in managedProjects"
              :key="p.id"
              :label="p.name"
              :value="p.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item
          v-if="generateForm.scope === 'personal' && canGenerateForOthers"
          label="为谁生成（默认为自己）"
        >
          <el-select
            v-model="generateForm.targetUserId"
            placeholder="自己"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="m in visibleMembers"
              :key="m.userId"
              :label="m.displayName"
              :value="m.userId"
            />
          </el-select>
        </el-form-item>

        <el-form-item :label="`基准日期（确定${typeLabel}周期）`">
          <el-date-picker
            v-model="generateForm.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择周期内的任意日期"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="AI 引擎">
          <el-radio-group v-model="generateForm.provider">
            <el-radio-button value="qwen" :disabled="!providers.qwenConfigured">通义千问</el-radio-button>
            <el-radio-button value="deepseek" :disabled="!providers.deepseekConfigured">DeepSeek</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="自定义提示词（可选）">
          <el-select v-model="generateForm.promptId" placeholder="使用默认提示词" clearable style="width: 100%">
            <el-option
              v-for="p in prompts"
              :key="p.id"
              :label="p.name + (p.is_default ? '（默认）' : '')"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="!providers.qwenConfigured && !providers.deepseekConfigured"
        type="warning"
        :closable="false"
        title="服务端未配置 AI API Key，无法生成"
        class="ai-warning"
      />

      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!providers.qwenConfigured && !providers.deepseekConfigured"
          @click="handleGenerate"
        >
          {{ generating ? 'AI 生成中...' : '开始生成' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 报告详情对话框 -->
    <el-dialog v-model="detailVisible" title="报告详情" :width="isMobile ? '94%' : '760px'" top="4vh">
      <template v-if="currentReport">
        <el-descriptions :column="isMobile ? 1 : 3" border size="small" class="detail-desc">
          <el-descriptions-item label="类型">
            {{ currentReport.type === 'weekly' ? '周报' : '月报' }}
          </el-descriptions-item>
          <el-descriptions-item label="范围">
            {{ currentReport.scope === 'project' ? `项目：${currentReport.project_name}` : `个人：${currentReport.target_name || '我'}` }}
          </el-descriptions-item>
          <el-descriptions-item label="周期">
            {{ currentReport.period_start }} ~ {{ currentReport.period_end }}
          </el-descriptions-item>
        </el-descriptions>
        <div class="report-content markdown-content" v-html="renderedContent"></div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { reportApi, projectApi, promptApi, chatApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import type { Report, Project, UserPrompt, ProjectMember } from '../../types';

const userStore = useUserStore();
const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

const reports = ref<Report[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const filterType = ref('');

const projects = ref<Project[]>([]);
const prompts = ref<UserPrompt[]>([]);
const providers = reactive({ qwenConfigured: false, deepseekConfigured: false });

const generateVisible = ref(false);
const generating = ref(false);
const reportType = ref<'weekly' | 'monthly'>('weekly');
const generateForm = reactive({
  scope: 'personal' as 'personal' | 'project',
  projectId: undefined as number | undefined,
  targetUserId: undefined as number | undefined,
  date: new Date().toISOString().slice(0, 10),
  provider: 'qwen',
  promptId: undefined as number | undefined,
});

const detailVisible = ref(false);
const currentReport = ref<Report | null>(null);

const typeLabel = computed(() => (reportType.value === 'weekly' ? '周报' : '月报'));

// 我管理的项目（可生成项目报告）
const managedProjects = computed(() =>
  projects.value.filter((p) => userStore.isDirector || p.myRole === 'manager')
);

const canGenerateProject = computed(() => managedProjects.value.length > 0);

// 权限范围内成员（可为他人生成个人报告）
const canGenerateForOthers = computed(() => {
  const role = userStore.user?.role;
  return role === 'director' || role === 'manager' || role === 'leader';
});

const visibleMembers = computed(() => {
  const map = new Map<number, ProjectMember>();
  projects.value.forEach((p) => {
    (p.members || []).forEach((m) => {
      if (!map.has(m.userId)) map.set(m.userId, m);
    });
  });
  return [...map.values()];
});

// 简易 Markdown 渲染（标题/加粗/列表/换行）
const renderedContent = computed(() => {
  if (!currentReport.value) return '';
  let md = currentReport.value.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  md = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<p>${md}</p>`;
});

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

function showGenerateDialog(type: 'weekly' | 'monthly') {
  reportType.value = type;
  generateForm.scope = 'personal';
  generateForm.projectId = undefined;
  generateForm.targetUserId = undefined;
  generateForm.date = new Date().toISOString().slice(0, 10);
  if (!providers.qwenConfigured && providers.deepseekConfigured) {
    generateForm.provider = 'deepseek';
  } else {
    generateForm.provider = 'qwen';
  }
  generateVisible.value = true;
}

async function handleGenerate() {
  if (generateForm.scope === 'project' && !generateForm.projectId) {
    ElMessage.warning('请选择项目');
    return;
  }
  generating.value = true;
  try {
    const res = await reportApi.generate({
      type: reportType.value,
      scope: generateForm.scope,
      targetUserId: generateForm.targetUserId,
      projectId: generateForm.projectId,
      date: generateForm.date,
      provider: generateForm.provider,
      promptId: generateForm.promptId,
    });
    ElMessage.success('报告生成成功');
    generateVisible.value = false;
    currentReport.value = res.data;
    detailVisible.value = true;
    loadReports();
  } finally {
    generating.value = false;
  }
}

async function viewReport(row: Report) {
  const res = await reportApi.detail(row.id);
  currentReport.value = res.data;
  detailVisible.value = true;
}

async function handleDelete(row: Report) {
  await ElMessageBox.confirm('确定要删除该报告吗？', '提示', { type: 'warning' });
  await reportApi.remove(row.id);
  ElMessage.success('删除成功');
  loadReports();
}

async function loadReports() {
  loading.value = true;
  try {
    const res = await reportApi.list({
      type: filterType.value || undefined,
      page: page.value,
      pageSize: 20,
    });
    reports.value = res.data.list || [];
    total.value = res.data.total || 0;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  loadReports();
  const [projectRes, promptRes, providerRes] = await Promise.all([
    projectApi.list(),
    promptApi.list('report'),
    chatApi.providers(),
  ]);
  projects.value = projectRes.data || [];
  prompts.value = promptRes.data?.prompts || [];
  providers.qwenConfigured = providerRes.data.qwenConfigured;
  providers.deepseekConfigured = providerRes.data.deepseekConfigured;
});
</script>

<style scoped>
.generate-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.generate-tip {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.ai-warning {
  margin-top: 8px;
}

/* 移动端报告卡片 */
.mobile-report-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-report-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
}

.mobile-report-item:active {
  background: #f5f7fa;
}

.report-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.report-time {
  margin-left: auto;
  font-size: 12px;
  color: #c0c4cc;
}

.report-subject {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.report-period {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* 详情 */
.detail-desc {
  margin-bottom: 16px;
}

.report-content {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  font-size: 14px;
  line-height: 1.8;
  max-height: 60vh;
  overflow-y: auto;
  color: #303133;
}

.report-content :deep(li) {
  margin-left: 20px;
}
</style>
