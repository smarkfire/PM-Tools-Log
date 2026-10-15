<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">{{ isTeam ? '团队日志' : '我的日志' }}</div>
      <div class="page-desc">
        {{ isTeam ? '根据您的数据权限展示可见范围内成员的日志' : '我填写的所有工作日志' }}
      </div>
    </div>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="responsive-form">
        <el-form-item label="项目">
          <el-select
            v-model="query.projectId"
            placeholder="全部项目"
            clearable
            style="width: 160px"
            @change="loadLogs"
          >
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="成员">
          <el-select
            v-if="isTeam"
            v-model="query.userId"
            placeholder="全部成员"
            clearable
            filterable
            style="width: 140px"
            @change="loadLogs"
          >
            <el-option
              v-for="m in memberOptions"
              :key="m.userId"
              :label="m.displayName"
              :value="m.userId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :style="isMobile ? 'width: 100%' : 'width: 240px'"
            @change="loadLogs"
          />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="搜索日志内容"
            clearable
            style="width: 180px"
            @keyup.enter="loadLogs"
            @clear="loadLogs"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadLogs">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button v-if="!isTeam" type="success" @click="$router.push('/logs/write')">
            <el-icon><EditPen /></el-icon>填写日志
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 日志列表：桌面表格 / 移动端卡片 -->
    <el-card shadow="never" v-loading="loading">
      <!-- 桌面端表格 -->
      <el-table v-if="!isMobile" :data="logs" stripe>
        <el-table-column prop="log_date" label="日志日期" width="110">
          <template #default="{ row }">{{ formatDateOnly(row.log_date) }}</template>
        </el-table-column>
        <el-table-column prop="user_name" label="成员" width="100" v-if="isTeam" />
        <el-table-column prop="project_name" label="项目" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.project_name" size="small" effect="light">{{ row.project_name }}</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="300">
          <template #default="{ row }">
            <div class="log-preview">{{ previewText(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="hours" label="工时" width="80">
          <template #default="{ row }">{{ row.hours ? row.hours + 'h' : '-' }}</template>
        </el-table-column>
        <el-table-column label="AI" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.ai_provider" size="small" :type="row.ai_provider === 'qwen' ? 'primary' : 'success'">
              {{ row.ai_provider === 'qwen' ? '千问' : 'DS' }}
            </el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="数据时间" width="170">
          <template #default="{ row }">
            <span class="log-datetime">{{ formatDateTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewLog(row)">查看</el-button>
            <el-button
              v-if="row.user_id === userStore.user?.id"
              link
              type="primary"
              size="small"
              @click="handleEditLog(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.user_id === userStore.user?.id && isInCurrentWeek(row.log_date)"
              link
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 移动端卡片 -->
      <div v-else class="mobile-log-list">
        <div v-for="log in logs" :key="log.id" class="mobile-log-item" @click="viewLog(log)">
          <div class="mobile-log-top">
            <span class="log-date">{{ formatDateOnly(log.log_date) }}</span>
            <el-tag v-if="log.project_name" size="small" effect="light">{{ log.project_name }}</el-tag>
            <span v-if="log.hours" class="log-hours">{{ log.hours }}h</span>
          </div>
          <div v-if="isTeam" class="mobile-log-user">{{ log.user_name }}</div>
          <div class="log-preview">{{ previewText(log) }}</div>
          <div class="mobile-log-datetime">数据时间：{{ formatDateTime(log.created_at) }}</div>
        </div>
        <el-empty v-if="!loading && logs.length === 0" description="暂无日志" />
      </div>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="loadLogs"
          @size-change="loadLogs"
        />
      </div>
    </el-card>

    <!-- 日志详情对话框 -->
    <el-dialog v-model="detailVisible" title="日志详情" :width="isMobile ? '92%' : '700px'" top="6vh">
      <template v-if="currentLog">
        <el-descriptions :column="isMobile ? 1 : 3" border size="small" class="detail-desc">
          <el-descriptions-item label="日志日期">{{ formatDateOnly(currentLog.log_date) }}</el-descriptions-item>
          <el-descriptions-item label="成员">{{ currentLog.user_name }}</el-descriptions-item>
          <el-descriptions-item label="项目">{{ currentLog.project_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="工时">
            {{ currentLog.hours ? currentLog.hours + ' 小时' : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="数据时间" :span="isMobile ? 1 : 2">
            {{ formatDateTime(currentLog.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="AI 优化">
            <el-tag v-if="currentLog.ai_provider" size="small" :type="currentLog.ai_provider === 'qwen' ? 'primary' : 'success'">
              {{ currentLog.ai_provider === 'qwen' ? '通义千问' : 'DeepSeek' }}
            </el-tag>
            <span v-else>未优化</span>
          </el-descriptions-item>
        </el-descriptions>

        <template v-if="currentLog.optimized_content">
          <div class="section-title">AI 优化后内容</div>
          <div class="log-content">
            <MdPreview :content="currentLog.optimized_content" />
          </div>
          <div class="section-title">原始内容</div>
          <div class="log-content original">{{ currentLog.content }}</div>
        </template>
        <template v-else>
          <div class="section-title">日志内容</div>
          <div class="log-content">
            <MdPreview :content="currentLog.content" />
          </div>
        </template>
      </template>
      <template #footer>
        <el-button
          v-if="currentLog.user_id === userStore.user?.id"
          type="primary"
          @click="handleEditLog(currentLog)"
        >
          编辑此日志
        </el-button>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 跨周修改申请弹窗 -->
    <el-dialog v-model="applyVisible" title="申请修改已过期的日志" :width="isMobile ? '92%' : '480px'">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="该日志已超过本周"
        description="本周过后修改需经上级领导审批。请填写修改原因提交申请，审批通过后即可修改（仅可修改一次）。"
        style="margin-bottom: 16px"
      />
      <el-form label-position="top">
        <el-form-item label="修改原因" required>
          <el-input
            v-model="applyForm.reason"
            type="textarea"
            :rows="4"
            placeholder="请说明为什么需要修改这篇日志"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="applyVisible = false">取消</el-button>
        <el-button type="primary" :loading="applySubmitting" @click="submitApply">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { logApi, projectApi, approvalApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import { isInCurrentWeek, formatDateTime } from '../../utils/date';
import MdPreview from '../../components/MdPreview.vue';
import type { Project, WorkLog, ProjectMember } from '../../types';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const appStore = useAppStore();

const isMobile = computed(() => appStore.isMobile);
const isTeam = computed(() => route.path === '/logs/all');

const logs = ref<WorkLog[]>([]);
const total = ref(0);
const loading = ref(false);
const projects = ref<Project[]>([]);
const memberOptions = ref<ProjectMember[]>([]);
const dateRange = ref<[string, string] | null>(null);

const query = reactive({
  projectId: undefined as number | undefined,
  userId: undefined as number | undefined,
  keyword: '',
  page: 1,
  pageSize: 20,
});

const detailVisible = ref(false);
const currentLog = ref<WorkLog | null>(null);

function previewText(log: WorkLog) {
  const text = log.optimized_content || log.content;
  return text.length > 100 ? text.slice(0, 100) + '...' : text;
}

/** 日志日期：仅取年月日（YYYY-MM-DD），去掉可能带出的时间部分 */
function formatDateOnly(d?: string) {
  return d ? d.slice(0, 10) : '-';
}

async function loadLogs() {
  loading.value = true;
  try {
    const params: any = {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      projectId: query.projectId || undefined,
    };
    if (isTeam.value && query.userId) params.userId = query.userId;
    if (!isTeam.value) params.userId = userStore.user?.id;
    if (dateRange.value) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }
    const res = await logApi.list(params);
    logs.value = res.data.list || [];
    total.value = res.data.total || 0;
  } finally {
    loading.value = false;
  }
}

function viewLog(log: WorkLog) {
  currentLog.value = log;
  detailVisible.value = true;
}

// ==================== 编辑与跨周审批 ====================
const applyVisible = ref(false);
const applySubmitting = ref(false);
const applyForm = reactive({ reason: '' });
const applyTarget = ref<WorkLog | null>(null);

/** 编辑自己的日志：本周内直接编辑；跨周需审批（总监除外） */
function handleEditLog(log: WorkLog) {
  if (log.user_id !== userStore.user?.id) {
    ElMessage.warning('只能编辑自己的日志');
    return;
  }
  if (isInCurrentWeek(log.log_date) || userStore.isDirector) {
    detailVisible.value = false;
    router.push(`/logs/write?date=${log.log_date}`);
    return;
  }
  applyTarget.value = log;
  applyForm.reason = '';
  detailVisible.value = false;
  applyVisible.value = true;
}

async function submitApply() {
  if (!applyForm.reason.trim()) {
    ElMessage.warning('请填写修改原因');
    return;
  }
  applySubmitting.value = true;
  try {
    await approvalApi.create({
      targetType: 'log',
      targetId: applyTarget.value!.id,
      reason: applyForm.reason.trim(),
    });
    ElMessage.success('申请已提交，等待上级审批');
    applyVisible.value = false;
  } finally {
    applySubmitting.value = false;
  }
}

async function handleDelete(log: WorkLog) {
  await ElMessageBox.confirm('确定要删除这条日志吗？', '提示', { type: 'warning' });
  await logApi.remove(log.id);
  ElMessage.success('删除成功');
  loadLogs();
}

onMounted(async () => {
  await loadLogs();
  // 加载项目与成员选项（用于筛选）
  try {
    const projectRes = await projectApi.list();
    projects.value = projectRes.data || [];
    // 成员选项：从所有可见项目的成员中聚合去重
    const map = new Map<number, ProjectMember>();
    projects.value.forEach((p) => {
      (p.members || []).forEach((m) => {
        if (!map.has(m.userId)) map.set(m.userId, m);
      });
    });
    memberOptions.value = [...map.values()];
  } catch {
    // 忽略
  }
});
</script>

<style scoped>
.log-preview {
  color: var(--text-regular);
  font-size: 13px;
  line-height: 1.5;
}

/* 移动端卡片样式 */
.mobile-log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-log-item {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s;
}

.mobile-log-item:active {
  background: #f5f7fa;
  transform: scale(0.995);
}

.mobile-log-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.log-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-hours {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: auto;
}

.mobile-log-datetime {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-placeholder);
}

.mobile-log-user {
  font-size: 12px;
  color: var(--primary-color);
  margin-bottom: 4px;
}

/* 详情 */
.detail-desc {
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 14px 0 8px;
}

.log-content {
  background: #f8f9fb;
  border-radius: var(--radius-lg);
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.log-content.original {
  color: var(--text-secondary);
  white-space: pre-wrap;
}
</style>
