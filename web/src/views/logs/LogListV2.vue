<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-left">
        <div class="page-title">我的日志·新版</div>
        <div class="page-desc">对话式填报产生的日志（每日一条，项目写在日志内容中）</div>
      </div>
      <div class="header-tools">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="card">
            <el-icon style="margin-right: 4px; vertical-align: -2px"><Grid /></el-icon>卡片
          </el-radio-button>
          <el-radio-button value="list">
            <el-icon style="margin-right: 4px; vertical-align: -2px"><List /></el-icon>列表
          </el-radio-button>
        </el-radio-group>
        <el-button type="primary" @click="$router.push('/logs/write-v2')">
          <el-icon><MagicStick /></el-icon>去填写
        </el-button>
      </div>
    </div>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" class="responsive-form">
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
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" v-loading="loading">
      <!-- 卡片视图 -->
      <div v-if="viewMode === 'card'" class="log-cards">
        <div v-for="log in logs" :key="log.id" class="log-card" @click="viewLog(log)">
          <div class="card-top">
            <span class="card-date">{{ formatDateOnly(log.log_date) }}</span>
            <span class="score-badge" :class="scoreClass(log.ai_score)">
              {{ log.ai_score != null ? log.ai_score + ' 分' : '未评分' }}
            </span>
          </div>
          <div v-if="extractProjects(log).length" class="card-projects">
            <el-tag v-for="p in extractProjects(log)" :key="p" size="small" effect="light">{{ p }}</el-tag>
          </div>
          <div class="card-preview">{{ previewText(log) }}</div>
          <div class="card-foot">
            <span v-if="log.hours != null" class="card-hours">{{ log.hours }}h</span>
            <el-tag v-if="log.ai_provider" size="small" :type="log.ai_provider === 'qwen' ? 'primary' : 'success'">
              {{ log.ai_provider === 'qwen' ? '千问' : 'DS' }}
            </el-tag>
            <span class="card-time">{{ formatDateTime(log.created_at) }}</span>
          </div>
        </div>
        <el-empty
          v-if="!loading && logs.length === 0"
          description="暂无新版日志，去「填写日志·新版」体验对话式填报吧"
          :image-size="80"
        >
          <el-button type="primary" @click="$router.push('/logs/write-v2')">去填写日志</el-button>
        </el-empty>
      </div>

      <!-- 列表视图 -->
      <template v-else>
        <el-table :data="logs" stripe>
          <el-table-column prop="log_date" label="日志日期" width="110">
            <template #default="{ row }">{{ formatDateOnly(row.log_date) }}</template>
          </el-table-column>
          <el-table-column label="项目" min-width="150">
            <template #default="{ row }">
              <template v-if="extractProjects(row).length">
                <el-tag
                  v-for="p in extractProjects(row).slice(0, 2)"
                  :key="p"
                  size="small"
                  effect="light"
                  style="margin-right: 4px"
                >{{ p }}</el-tag>
                <span v-if="extractProjects(row).length > 2" class="text-muted">+{{ extractProjects(row).length - 2 }}</span>
              </template>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="得分" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.ai_score != null" size="small" :type="scoreType(row.ai_score)" effect="dark">
                {{ row.ai_score }}分
              </el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="hours" label="工时" width="70">
            <template #default="{ row }">{{ row.hours != null ? row.hours + 'h' : '-' }}</template>
          </el-table-column>
          <el-table-column label="内容" min-width="280">
            <template #default="{ row }">
              <div class="log-preview">{{ previewText(row) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="AI" width="70">
            <template #default="{ row }">
              <el-tag v-if="row.ai_provider" size="small" :type="row.ai_provider === 'qwen' ? 'primary' : 'success'">
                {{ row.ai_provider === 'qwen' ? '千问' : 'DS' }}
              </el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="数据时间" width="160">
            <template #default="{ row }">
              <span class="log-datetime">{{ formatDateTime(row.created_at) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="viewLog(row)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && logs.length === 0" description="暂无新版日志" :image-size="80" />
      </template>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[12, 24, 48]"
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
          <el-descriptions-item label="AI 得分">
            <el-tag v-if="currentLog.ai_score != null" size="small" :type="scoreType(currentLog.ai_score)" effect="dark">
              {{ currentLog.ai_score }} 分
            </el-tag>
            <span v-else>未评分</span>
          </el-descriptions-item>
          <el-descriptions-item label="工时">
            {{ currentLog.hours != null ? currentLog.hours + ' 小时' : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="涉及项目" :span="isMobile ? 1 : 2">
            <template v-if="extractProjects(currentLog).length">
              <el-tag
                v-for="p in extractProjects(currentLog)"
                :key="p"
                size="small"
                effect="light"
                style="margin-right: 4px"
              >{{ p }}</el-tag>
            </template>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="数据时间" :span="isMobile ? 1 : 2">
            {{ formatDateTime(currentLog.created_at) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title">日志内容</div>
        <div class="log-content">
          <MdPreview :content="logText(currentLog)" />
        </div>

        <el-collapse v-if="currentLog.content && currentLog.content !== logText(currentLog)" class="origin-collapse">
          <el-collapse-item :title="`原始记录（待办执行情况）`" name="origin">
            <div class="log-content original">{{ currentLog.content }}</div>
          </el-collapse-item>
        </el-collapse>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { logApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import { formatDateTime } from '../../utils/date';
import MdPreview from '../../components/MdPreview.vue';
import type { WorkLog } from '../../types';

const userStore = useUserStore();
const appStore = useAppStore();

const isMobile = computed(() => appStore.isMobile);

const logs = ref<WorkLog[]>([]);
const total = ref(0);
const loading = ref(false);
const dateRange = ref<[string, string] | null>(null);

/** 视图模式：card 卡片 / list 列表（记忆用户选择） */
const viewMode = ref<string>(localStorage.getItem('logV2ViewMode') || 'card');
watch(viewMode, (v) => localStorage.setItem('logV2ViewMode', v));

const query = reactive({
  keyword: '',
  page: 1,
  pageSize: 12,
});

const detailVisible = ref(false);
const currentLog = ref<WorkLog | null>(null);

/** 日志正文：新版日志正式内容存于 optimized_content */
function logText(log: WorkLog) {
  return log.optimized_content || log.content;
}

/** 日志日期：仅取年月日 */
function formatDateOnly(d?: string) {
  return d ? d.slice(0, 10) : '-';
}

/** 从内容二级标题提取涉及的项目（排除固定章节） */
const FIXED_SECTIONS = ['明日计划', '问题与风险'];
function extractProjects(log: WorkLog): string[] {
  const names = (logText(log).match(/^##\s+(.+)$/gm) || []).map((l) => l.replace(/^##\s+/, '').trim());
  return [...new Set(names.filter((n) => n && !FIXED_SECTIONS.includes(n)))];
}

/** 卡片/弹窗纯文本摘要（去掉 Markdown 标记） */
function previewText(log: WorkLog) {
  const text = logText(log)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
  return text.length > 120 ? text.slice(0, 120) + '…' : text;
}

/** 得分颜色：≥80 绿 / ≥60 橙 / <60 红 */
function scoreType(s: number | null): 'success' | 'warning' | 'danger' | 'info' {
  if (s == null) return 'info';
  if (s >= 80) return 'success';
  if (s >= 60) return 'warning';
  return 'danger';
}

function scoreClass(s: number | null) {
  if (s == null) return 'score-none';
  if (s >= 80) return 'score-high';
  if (s >= 60) return 'score-mid';
  return 'score-low';
}

async function loadLogs() {
  loading.value = true;
  try {
    const res = await logApi.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      userId: userStore.user?.id,
      source: 'v2',
      ...(dateRange.value ? { startDate: dateRange.value[0], endDate: dateRange.value[1] } : {}),
    });
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

onMounted(loadLogs);
</script>

<style scoped>
.header-left {
  min-width: 0;
}

.header-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* ==================== 卡片视图 ==================== */
.log-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.log-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 150px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}

.log-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
  border-color: var(--primary-color, #409eff);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-date {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.score-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  flex-shrink: 0;
}

.score-high {
  background: #e8f7ee;
  color: #2e9e5b;
}

.score-mid {
  background: #fdf3e7;
  color: #cf8a2a;
}

.score-low {
  background: #fdeaea;
  color: #d65a5a;
}

.score-none {
  background: #f0f2f5;
  color: #909399;
}

.card-projects {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card-preview {
  color: var(--text-regular);
  font-size: 13px;
  line-height: 1.6;
  flex: 1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.card-hours {
  font-weight: 600;
  color: var(--primary-color);
}

.card-time {
  margin-left: auto;
  color: var(--text-placeholder);
}

/* ==================== 列表视图 ==================== */
.log-preview {
  color: var(--text-regular);
  font-size: 13px;
  line-height: 1.5;
}

.log-datetime {
  font-size: 12px;
  color: var(--text-placeholder);
}

.text-muted {
  color: var(--text-placeholder);
  font-size: 12px;
}

/* ==================== 详情 ==================== */
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
  border-radius: var(--radius-lg, 10px);
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}

.log-content.original {
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.origin-collapse {
  margin-top: 12px;
  border-top: none;
}
</style>
