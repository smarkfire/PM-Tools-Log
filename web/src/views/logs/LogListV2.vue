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
          <el-button type="success" @click="$router.push('/logs/write-v2')">
            <el-icon><EditPen /></el-icon>填写日志
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" v-loading="loading">
      <!-- 卡片视图 -->
      <div v-if="viewMode === 'card'" class="log-cards">
        <div
          v-for="log in logs"
          :key="log.id"
          class="log-card"
          :class="accentClass(log.ai_score)"
          @click="viewLog(log)"
        >
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
            <span class="card-time">{{ formatDateTime(dataTime(log)) }}</span>
          </div>
          <div v-if="isMine(log)" class="card-actions" @click.stop>
            <el-button v-if="canDirectEdit(log)" link type="primary" size="small" @click="handleEdit(log)">编辑</el-button>
            <el-button v-else-if="log.edit_approval_status === 'pending'" link type="info" size="small" disabled>审批中</el-button>
            <el-button v-else link type="warning" size="small" @click="handleApplyEdit(log)">申请编辑</el-button>
            <el-button v-if="isInCurrentWeek(log.log_date)" link type="danger" size="small" @click="handleDelete(log)">删除</el-button>
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
              <span class="log-datetime">{{ formatDateTime(dataTime(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="viewLog(row)">查看</el-button>
              <el-button
                v-if="isMine(row) && canDirectEdit(row)"
                link
                type="primary"
                size="small"
                @click="handleEdit(row)"
              >
                编辑
              </el-button>
              <el-button
                v-else-if="isMine(row) && row.edit_approval_status === 'pending'"
                link
                type="info"
                size="small"
                disabled
              >
                审批中
              </el-button>
              <el-button v-else-if="isMine(row)" link type="warning" size="small" @click="handleApplyEdit(row)">
                申请编辑
              </el-button>
              <el-button
                v-if="isMine(row) && isInCurrentWeek(row.log_date)"
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
            {{ formatDateTime(dataTime(currentLog)) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title-row">
          <div class="section-title">日志内容</div>
          <el-radio-group v-if="isMine(currentLog) && canDirectEdit(currentLog)" v-model="detailMode" size="small">
            <el-radio-button value="preview">预览</el-radio-button>
            <el-radio-button value="edit">编辑</el-radio-button>
          </el-radio-group>
        </div>
        <div v-if="detailMode === 'preview'" class="log-content">
          <MdPreview :content="logText(currentLog)" />
        </div>
        <template v-else>
          <el-input
            v-model="editForm.content"
            type="textarea"
            :rows="14"
            class="edit-textarea"
            placeholder="请修改日志内容（保持标准模板结构）"
          />
          <el-button type="primary" :loading="editSaving" style="width: 100%; margin-top: 10px" @click="saveEdited">
            <el-icon><Check /></el-icon>保存修改
          </el-button>
        </template>

        <el-collapse
          v-if="detailMode === 'preview' && currentLog.content && currentLog.content !== logText(currentLog)"
          class="origin-collapse"
        >
          <el-collapse-item :title="`原始记录（待办执行情况）`" name="origin">
            <div class="log-content original">{{ currentLog.content }}</div>
          </el-collapse-item>
        </el-collapse>
      </template>
      <template #footer>
        <el-button
          v-if="isMine(currentLog) && canDirectEdit(currentLog)"
          type="primary"
          @click="detailMode = 'edit'"
        >
          编辑此日志
        </el-button>
        <el-button v-else-if="isMine(currentLog) && currentLog.edit_approval_status === 'pending'" disabled>
          修改申请审批中
        </el-button>
        <el-button v-else-if="isMine(currentLog)" type="warning" @click="handleApplyEdit(currentLog)">
          申请编辑
        </el-button>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 跨周修改申请弹窗 -->
    <el-dialog v-model="applyVisible" title="申请修改已过期的日志" :width="isMobile ? '92%' : '480px'">
      <el-alert
        title="本周过后修改需经上级领导审批。请填写修改原因提交申请，审批通过后即可修改（仅可修改一次）。"
        type="info"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <el-input v-model="applyForm.reason" type="textarea" :rows="3" placeholder="请填写修改原因" />
      <template #footer>
        <el-button @click="applyVisible = false">取消</el-button>
        <el-button type="primary" :loading="applySubmitting" @click="submitApply">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 保存修改前二次质检：展示分数与修改建议，确认保存或返回修改 -->
    <el-dialog v-model="reviewVisible" title="保存前质量检查" :width="isMobile ? '92%' : '520px'" top="8vh">
      <div v-if="!reviewResult" v-loading="reviewing" class="review-loading">AI 正在复检日志，请稍候…</div>
      <template v-else>
        <div class="review-head">
          <span class="review-score" :class="scoreClass(reviewResult.score)">
            {{ reviewResult.score != null ? reviewResult.score + ' 分' : '未评分' }}
          </span>
          <span v-if="reviewResult.score != null" class="review-pass">
            {{ reviewResult.score >= 80 ? '已达到 80 分保存标准' : '未达到 80 分标准，建议返回修改' }}
          </span>
        </div>
        <div v-if="reviewResult.summary" class="review-summary">{{ reviewResult.summary }}</div>
        <template v-if="reviewResult.suggestions.length">
          <div class="review-sug-title">修改建议：</div>
          <ul class="review-sug-list">
            <li v-for="(s, i) in reviewResult.suggestions" :key="i">{{ s }}</li>
          </ul>
        </template>
        <div v-else class="review-sug-title" style="color: var(--el-color-success)">
          AI 未发现需要修改的问题。
        </div>
      </template>
      <template #footer>
        <el-button @click="reviewVisible = false">返回修改</el-button>
        <el-button type="success" :loading="editSaving" :disabled="!reviewResult" @click="confirmSaveEdited">
          <el-icon><Check /></el-icon>确认保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { approvalApi, chatApi, logApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import { formatDateTime, isInCurrentWeek } from '../../utils/date';
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

/** 从内容二级标题提取涉及的项目（去掉"项目名称："前缀，排除固定章节，兼容旧格式） */
const FIXED_SECTIONS = ['明日计划', '问题与风险'];
function extractProjects(log: WorkLog): string[] {
  const names = (logText(log).match(/^##\s+(.+)$/gm) || [])
    .map((l) => l.replace(/^##\s+/, '').replace(/^项目名称[:：]\s*/, '').trim());
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

/** 数据时间：编辑保存过后显示最新更新时间，否则显示创建时间 */
function dataTime(log: WorkLog) {
  const u = log.updated_at;
  return u && u !== log.created_at ? u : log.created_at;
}

/** 卡片左侧色条按得分着色 */
function accentClass(s: number | null) {
  if (s == null) return 'accent-none';
  if (s >= 80) return 'accent-high';
  if (s >= 60) return 'accent-mid';
  return 'accent-low';
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
  detailMode.value = 'preview';
  editForm.content = logText(log);
  detailVisible.value = true;
}

// ==================== 编辑 / 跨周审批 / 删除（与旧版我的日志一致） ====================
const detailMode = ref<'preview' | 'edit'>('preview');
const editForm = reactive({ content: '' });
const editSaving = ref(false);

// 保存修改前的二次质检
interface ReviewResult {
  score: number | null;
  summary: string;
  suggestions: string[];
}
const reviewVisible = ref(false);
const reviewing = ref(false);
const reviewResult = ref<ReviewResult | null>(null);

const applyVisible = ref(false);
const applySubmitting = ref(false);
const applyForm = reactive({ reason: '' });
const applyTarget = ref<WorkLog | null>(null);

function isMine(log: WorkLog): boolean {
  return log.user_id === userStore.user?.id;
}

/**
 * 是否可直接编辑：
 * 总监/系统管理员任意编辑；本周内（周一至周日）的日志直接编辑；
 * 跨周日志需有审批通过的修改申请（通过后仅可修改一次，保存后失效）
 */
function canDirectEdit(log: WorkLog): boolean {
  if (userStore.isDirector) return true;
  if (isInCurrentWeek(log.log_date)) return true;
  return log.edit_approval_status === 'approved';
}

/** 编辑：打开详情弹窗并进入编辑模式 */
function handleEdit(log: WorkLog) {
  viewLog(log);
  detailMode.value = 'edit';
}

/** 申请修改跨周日志（已有待审批申请时提示，避免重复提交） */
function handleApplyEdit(log: WorkLog) {
  if (!isMine(log)) return;
  if (log.edit_approval_status === 'pending') {
    ElMessage.info('该日志已有待审批的修改申请，请等待审批结果');
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

/** 保存修改前先做二次质检：弹窗展示分数与修改建议，由用户决定返回修改或确认保存 */
async function saveEdited() {
  const log = currentLog.value;
  if (!log) return;
  if (!editForm.content.trim()) {
    ElMessage.warning('日志内容不能为空');
    return;
  }
  reviewResult.value = null;
  reviewVisible.value = true;
  reviewing.value = true;
  // 质检模型：优先用日志生成时的模型（若仍可用），否则用已配置的默认模型
  const preferredProvider =
    (log.ai_provider === 'deepseek' && providers.deepseekConfigured) ||
    (log.ai_provider === 'qwen' && providers.qwenConfigured)
      ? log.ai_provider
      : defaultProvider.value;
  try {
    const res = await logApi.review({
      date: String(log.log_date).slice(0, 10),
      content: editForm.content.trim(),
      provider: preferredProvider || undefined,
    });
    reviewResult.value = res.data;
  } catch (e: any) {
    reviewVisible.value = false;
    const msg = e?.response?.data?.message || e?.message || '网络异常';
    try {
      await ElMessageBox.confirm(`质量检查失败（${msg}），是否跳过质检直接保存？`, '提示', {
        type: 'warning',
        confirmButtonText: '直接保存',
        cancelButtonText: '取消',
      });
      await confirmSaveEdited();
    } catch {
      // 用户取消
    }
  } finally {
    reviewing.value = false;
  }
}

/** 质检弹窗中确认保存（保存的得分以本次质检分数为准） */
async function confirmSaveEdited() {
  const log = currentLog.value;
  if (!log) return;
  editSaving.value = true;
  try {
    await logApi.save({
      logDate: String(log.log_date).slice(0, 10),
      projectId: null,
      content: log.content,
      optimizedContent: editForm.content.trim(),
      aiProvider: log.ai_provider || undefined,
      hours: log.hours ?? undefined,
      source: 'v2',
      aiScore: reviewResult.value?.score ?? log.ai_score ?? undefined,
    });
    ElMessage.success('修改已保存');
    reviewVisible.value = false;
    detailVisible.value = false;
    loadLogs();
  } catch (e: any) {
    ElMessage.error('保存失败：' + (e?.response?.data?.message || e?.message || '网络异常'));
  } finally {
    editSaving.value = false;
  }
}

async function handleDelete(log: WorkLog) {
  await ElMessageBox.confirm('确定要删除这条日志吗？', '提示', { type: 'warning' });
  await logApi.remove(log.id);
  ElMessage.success('删除成功');
  loadLogs();
}

onMounted(loadLogs);

// ==================== AI 模型可用性（质检时自动选已配置的模型） ====================
const providers = reactive({ qwenConfigured: false, deepseekConfigured: false });
const defaultProvider = computed<'qwen' | 'deepseek'>(() =>
  providers.qwenConfigured ? 'qwen' : 'deepseek'
);

onMounted(async () => {
  try {
    const res = await chatApi.providers();
    providers.qwenConfigured = res.data.qwenConfigured;
    providers.deepseekConfigured = res.data.deepseekConfigured;
  } catch {
    /* 忽略：保持默认 */
  }
});
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

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
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.log-card {
  position: relative;
  overflow: hidden;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 12px;
  padding: 16px 18px 14px 22px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 158px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}

/* 左侧得分色条 */
.log-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #d4d7de;
}

.log-card.accent-high::before {
  background: #2e9e5b;
}

.log-card.accent-mid::before {
  background: #cf8a2a;
}

.log-card.accent-low::before {
  background: #d65a5a;
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
  font-size: 15px;
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
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 42px;
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

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 14px 0 8px;
}

.section-title-row .section-title {
  margin: 0;
}

.edit-textarea :deep(textarea) {
  font-family: inherit;
  line-height: 1.6;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  border-top: 1px dashed var(--border-lighter, #ebeef5);
  padding-top: 6px;
  margin-top: -2px;
  min-height: 24px;
}

/* ==================== 保存前质检弹窗 ==================== */
.review-loading {
  min-height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.review-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.review-score {
  font-size: 15px;
  font-weight: 600;
  padding: 3px 14px;
  border-radius: 999px;
  flex-shrink: 0;
}

.review-pass {
  font-size: 13px;
  color: var(--text-regular);
}

.review-summary {
  background: #f8f9fb;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-regular);
  margin-bottom: 10px;
}

.review-sug-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 6px 0;
}

.review-sug-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-regular);
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
