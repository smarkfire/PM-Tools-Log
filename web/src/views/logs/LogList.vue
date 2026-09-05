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
        <el-table-column prop="log_date" label="日期" width="110" />
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
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewLog(row)">查看</el-button>
            <el-button
              v-if="row.user_id === userStore.user?.id"
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
            <span class="log-date">{{ log.log_date }}</span>
            <el-tag v-if="log.project_name" size="small" effect="light">{{ log.project_name }}</el-tag>
            <span v-if="log.hours" class="log-hours">{{ log.hours }}h</span>
          </div>
          <div v-if="isTeam" class="mobile-log-user">{{ log.user_name }}</div>
          <div class="log-preview">{{ previewText(log) }}</div>
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
          <el-descriptions-item label="日期">{{ currentLog.log_date }}</el-descriptions-item>
          <el-descriptions-item label="成员">{{ currentLog.user_name }}</el-descriptions-item>
          <el-descriptions-item label="项目">{{ currentLog.project_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="工时">
            {{ currentLog.hours ? currentLog.hours + ' 小时' : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="AI 优化" :span="2">
            <el-tag v-if="currentLog.ai_provider" size="small" :type="currentLog.ai_provider === 'qwen' ? 'primary' : 'success'">
              {{ currentLog.ai_provider === 'qwen' ? '通义千问' : 'DeepSeek' }}
            </el-tag>
            <span v-else>未优化</span>
          </el-descriptions-item>
        </el-descriptions>

        <template v-if="currentLog.optimized_content">
          <div class="section-title">AI 优化后内容</div>
          <div class="log-content markdown-content">{{ currentLog.optimized_content }}</div>
          <div class="section-title">原始内容</div>
          <div class="log-content original">{{ currentLog.content }}</div>
        </template>
        <template v-else>
          <div class="section-title">日志内容</div>
          <div class="log-content">{{ currentLog.content }}</div>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { logApi, projectApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import type { Project, WorkLog, ProjectMember } from '../../types';

const route = useRoute();
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
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}

.text-muted {
  color: #c0c4cc;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 移动端卡片样式 */
.mobile-log-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-log-item {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
}

.mobile-log-item:active {
  background: #f0f2f5;
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
  color: #303133;
}

.log-hours {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.mobile-log-user {
  font-size: 12px;
  color: #409eff;
  margin-bottom: 4px;
}

/* 详情 */
.detail-desc {
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 14px 0 8px;
}

.log-content {
  background: #f8f9fb;
  border-radius: 8px;
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.log-content.original {
  color: #909399;
}
</style>
