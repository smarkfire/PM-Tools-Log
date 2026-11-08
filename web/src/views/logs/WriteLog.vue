<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">
        {{ isEdit ? `编辑日志（${form.logDate}）` : '填写日志' }}
        <el-popover placement="bottom-start" :width="560" trigger="hover" popper-class="tips-popover-popper">
          <template #reference>
            <el-icon class="tips-trigger"><InfoFilled /></el-icon>
          </template>
          <div class="tips-popover">
            <p class="tips-slogan">
              标准：别人不看代码、不开会，也能知道你这天<strong>干了什么、干到什么程度、明天从哪继续</strong>。AI 按此规范检查并打分（满分 100），<strong>达到 80 分</strong>才能生成定稿。
            </p>
            <p class="tips-structure-title">标准日志模板（Markdown 层级）：</p>
            <pre class="tips-template"># 2026-11-07 张三 的日志
## 项目名称：{项目名称}
- 投入时长：X小时
### 小组名称：{小组名称}
- {做了什么，有什么成果}
## 明日计划
- {后续工作安排}
## 问题与风险
- {卡点或需要的协助}</pre>
            <ol>
              <li><strong>一级标题</strong>：谁的哪天的日志</li>
              <li><strong>二级标题</strong>："项目名称：xxx"（下写当天总投入时长）、明日计划、问题与风险</li>
              <li><strong>三级标题</strong>："小组名称：xxx"，组下逐条写事项</li>
              <li><strong>每条事项</strong>：写清"做了什么、有什么成果"，对象融进句子（模块、页面、接口、文档、Bug 号），带进展状态，尽量量化</li>
            </ol>
            <p class="tips-structure-title">事项怎么写算好？公式：进展 + 对象 + 动作 + 成果：</p>
            <table class="tips-table">
              <tr><th>差的表述</th><th>好的表述</th></tr>
              <tr><td>处理了一些需求</td><td>完成用户管理页权限校验开发，提测通过</td></tr>
              <tr><td>修 Bug</td><td>修复登录 token 过期闪退问题（BUG-128），已上线</td></tr>
              <tr><td>继续做</td><td>智能体问答功能开发（进度 80%），剩余评测模块</td></tr>
            </table>
            <p class="tips-structure-title">评分构成（满分 100）：</p>
            <ol class="tips-score-list">
              <li><strong>规范符合度 40 分</strong>：结构层级正确（10）＋ 投入时长明确（10）＋ 明日计划（10）＋ 问题与风险（10，如实写"无"不扣）</li>
              <li>
                <strong>事项质量 60 分</strong>：每条事项按五条标准逐条核对，取平均折算——
                ① 有具体对象（融进句子，如模块/页面/接口/文档/Bug号）
                ② 有进展状态（完成 / 进行中百分比 / 受阻）
                ③ 有量化成果（数字/产出物，如实说明）
                ④ 一条一件事
                ⑤ 写结果不写过程（排查类写根因结论）
                笼统表述（"处理了一些工作""继续做"）按条扣分
              </li>
            </ol>
          </div>
        </el-popover>
      </div>
      <div class="page-desc">
        {{ isEdit
          ? '修改已有日志并保存；超过本周的修改需上级审批通过后才可提交'
          : '可填写本周任意一天的工作日志，支持通义千问 / DeepSeek AI 优化' }}
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 编辑区 -->
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">日志内容</span>
          </template>
          <el-form label-position="top">
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12">
                <el-form-item label="日志日期">
                  <el-date-picker
                    v-model="form.logDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="选择日期"
                    :disabled="isEdit"
                    :disabled-date="disableOutOfRangeDate"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="工作时长（小时）">
                  <el-input-number
                    v-model="form.hours"
                    :min="0"
                    :max="24"
                    :step="0.5"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="所属项目" required>
                  <el-select
                    v-model="form.projectId"
                    placeholder="请选择项目（必填）"
                    :clearable="false"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="p in projects"
                      :key="p.id"
                      :label="p.name"
                      :value="p.id"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col v-if="form.projectId && projectGroups.length" :xs="24" :sm="12">
                <el-form-item label="涉及小组（可多选）">
                  <el-select
                    v-model="groupSelection"
                    multiple
                    clearable
                    placeholder="选择本篇日志涉及的小组（可选）"
                    style="width: 100%"
                  >
                    <el-option v-for="g in projectGroups" :key="g.id" :label="g.name" :value="g.id" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item>
              <template #label>
                <span class="content-label">
                  今日工作内容（可直接写流水账，稍后用 AI 优化）
                  <el-tooltip
                    content="好日志五要素：做了什么 / 进展结果 / 工时投入 / 问题风险 / 后续计划"
                    placement="top"
                  >
                    <el-icon class="content-help"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="10"
                placeholder="示例：&#10;1. 上午开了需求评审会，确定了V2.0的三个核心功能&#10;2. 下午写完了用户模块的接口，自测通过&#10;3. 帮小王看了个线上bug，是空指针导致的"
                maxlength="10000"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- AI 优化区 -->
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="optimize-card">
          <template #header>
            <div class="optimize-header">
              <span class="card-title">AI 优化</span>
              <el-tag v-if="optimizedContent" :type="form.aiProvider === 'qwen' ? 'primary' : 'success'" size="small">
                {{ form.aiProvider === 'qwen' ? '通义千问' : 'DeepSeek' }}
              </el-tag>
            </div>
          </template>

          <!-- AI 设置 -->
          <div class="ai-settings">
            <el-radio-group v-model="aiProvider" size="small">
              <el-radio-button value="qwen" :disabled="!providers.qwenConfigured">
                通义千问
              </el-radio-button>
              <el-radio-button value="deepseek" :disabled="!providers.deepseekConfigured">
                DeepSeek
              </el-radio-button>
            </el-radio-group>

            <el-select
              v-model="selectedPromptId"
              placeholder="选择自定义提示词（可选）"
              clearable
              size="small"
              style="width: 100%; margin-top: 10px"
            >
              <el-option
                v-for="p in prompts"
                :key="p.id"
                :label="p.name + (p.is_default ? '（默认）' : '')"
                :value="p.id"
              />
            </el-select>
          </div>

          <el-alert
            v-if="!providers.qwenConfigured && !providers.deepseekConfigured"
            type="warning"
            :closable="false"
            title="AI 未配置"
            description="服务端未配置 AI API Key，请联系管理员在 server/.env 中配置 QWEN_API_KEY 或 DEEPSEEK_API_KEY"
            class="ai-warning"
          />

          <el-button
            type="primary"
            class="optimize-btn"
            :loading="optimizing"
            :disabled="!form.content?.trim() || (!providers.qwenConfigured && !providers.deepseekConfigured)"
            @click="handleOptimize"
          >
            <el-icon><MagicStick /></el-icon>
            {{ optimizing ? 'AI 正在优化中...' : 'AI 优化日志' }}
          </el-button>

          <!-- 优化结果：Markdown 编辑 / 预览 -->
          <div v-if="optimizedContent" class="optimize-result">
            <div class="result-header">
              <el-radio-group v-model="resultView" size="small">
                <el-radio-button value="edit">编辑</el-radio-button>
                <el-radio-button value="preview">预览</el-radio-button>
              </el-radio-group>
              <el-button link type="primary" size="small" @click="copyOptimized">
                <el-icon><CopyDocument /></el-icon>复制
              </el-button>
            </div>
            <el-input
              v-if="resultView === 'edit'"
              v-model="optimizedContent"
              type="textarea"
              :rows="12"
              class="result-textarea"
              placeholder="支持 Markdown 语法：# 标题、**加粗**、- 列表 等"
            />
            <div v-else class="result-preview">
              <MdPreview :content="optimizedContent" />
            </div>
            <div class="result-tip">默认展示渲染预览，切到"编辑"可直接修改 Markdown 源文</div>
          </div>
        </el-card>

        <el-card shadow="never" class="save-card">
          <el-button
            type="success"
            size="large"
            style="width: 100%"
            :loading="reviewing || saving"
            :disabled="!form.content?.trim() || !form.projectId"
            @click="handleSave"
          >
            <el-icon><Check /></el-icon>
            {{ reviewing ? 'AI 质检中...' : saving ? '保存中...' : '质检并保存' }}
          </el-button>
          <div class="save-tip">
            保存前先进行 AI 质量检查打分，确认后存档；优化内容与质检分数将一并保存
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 保存前质量检查结果 -->
    <el-dialog v-model="reviewVisible" title="保存前质量检查" width="min(92vw, 520px)" top="8vh" :close-on-click-modal="false">
      <div v-if="!reviewResult" class="review-loading">
        <el-icon class="review-spin"><Loading /></el-icon>
        <div class="review-loading-text">
          <div class="review-loading-title">AI 正在质检日志…</div>
          <div class="review-loading-step">{{ reviewStep }}</div>
        </div>
      </div>
      <template v-else>
        <div class="review-score-row">
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
          <ol class="review-sugs">
            <li v-for="(s, i) in reviewResult.suggestions" :key="i">{{ s }}</li>
          </ol>
        </template>
      </template>
      <template #footer>
        <el-button @click="cancelReview">返回修改</el-button>
        <el-button type="success" :loading="saving" :disabled="!reviewResult" @click="doSave">
          确认保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { logApi, projectApi, promptApi, chatApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { currentWeekMonday, formatDate } from '../../utils/date';
import MdPreview from '../../components/MdPreview.vue';
import type { Project, UserPrompt } from '../../types';

const userStore = useUserStore();
const projects = ref<Project[]>([]);
const prompts = ref<UserPrompt[]>([]);

const providers = reactive({ qwenConfigured: false, deepseekConfigured: false });
const aiProvider = ref<'qwen' | 'deepseek'>('qwen');
const selectedPromptId = ref<number | undefined>(undefined);

const today = formatDate(new Date());
const route = useRoute();
const router = useRouter();

// 编辑模式：?date=YYYY-MM-DD 时加载当天已有日志（防止手输链接带时间部分）
const editDate = computed(() => ((route.query.date as string) || '').slice(0, 10));
const isEdit = computed(() => !!editDate.value);

// 可填写日期范围：本周一 ~ 本周日（编辑模式日期锁定为原日志日期）
const weekMonday = currentWeekMonday();
const mondayTime = new Date(weekMonday + 'T00:00:00').getTime();
const sundayTime = mondayTime + 6 * 24 * 3600 * 1000;
function disableOutOfRangeDate(d: Date): boolean {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return t < mondayTime || t > sundayTime;
}

const form = reactive({
  logDate: editDate.value || today,
  projectId: undefined as number | undefined,
  hours: 8,
  content: '',
  aiProvider: '' as string,
});

const optimizedContent = ref('');
const resultView = ref<'edit' | 'preview'>('preview');
const optimizing = ref(false);
const saving = ref(false);

// ===== 保存前质量检查 =====
const reviewing = ref(false);
const reviewVisible = ref(false);
const reviewResult = ref<{ score: number | null; summary: string; suggestions: string[] } | null>(
  null
);

// 质检动作提示：轮换展示当前正在做的步骤
const REVIEW_STEPS = [
  '正在解析日志结构…',
  '正在逐项核对好日志规范…',
  '正在评估事项质量与量化成果…',
  '正在计算质量得分…',
];
const reviewStep = ref(REVIEW_STEPS[0]);
let reviewStepTimer: number | undefined;

function startReviewSteps() {
  stopReviewSteps();
  let i = 0;
  reviewStep.value = REVIEW_STEPS[0];
  reviewStepTimer = window.setInterval(() => {
    i = Math.min(i + 1, REVIEW_STEPS.length - 1);
    reviewStep.value = REVIEW_STEPS[i];
  }, 2600);
}

function stopReviewSteps() {
  if (reviewStepTimer) {
    clearInterval(reviewStepTimer);
    reviewStepTimer = undefined;
  }
}

/** 质检中点击"返回修改"：关闭弹窗并复位状态 */
function cancelReview() {
  reviewVisible.value = false;
  reviewing.value = false;
  stopReviewSteps();
}

/** 质检分数徽章配色 */
function scoreClass(s: number | null | undefined) {
  if (s == null) return 'score-none';
  if (s >= 80) return 'score-high';
  if (s >= 60) return 'score-mid';
  return 'score-low';
}

// ===== 跨组协作：涉及小组多选（工时不再按组分配，统一记当天总工时） =====
const groupSelection = ref<number[]>([]);

// 当前所选项目下的小组（需为项目成员才可标记，由后端校验）
const projectGroups = computed(() => {
  const p = projects.value.find((item) => item.id === form.projectId);
  return p?.groups || [];
});

// 切换项目时清空小组选择
watch(
  () => form.projectId,
  () => {
    groupSelection.value = [];
  }
);

onMounted(async () => {
  const [projectRes, promptRes, providerRes] = await Promise.all([
    projectApi.list(),
    promptApi.list('log_optimize'),
    chatApi.providers(),
  ]);
  projects.value = projectRes.data || [];
  prompts.value = promptRes.data?.prompts || [];
  providers.qwenConfigured = providerRes.data.qwenConfigured;
  providers.deepseekConfigured = providerRes.data.deepseekConfigured;
  if (!providers.qwenConfigured && providers.deepseekConfigured) {
    aiProvider.value = 'deepseek';
  }

  // 编辑模式：加载已有日志内容
  if (isEdit.value) {
    const res = await logApi.list({
      userId: userStore.user?.id,
      startDate: editDate.value,
      endDate: editDate.value,
      page: 1,
      pageSize: 1,
    });
    const existing = res.data.list?.[0];
    if (existing) {
      // log_date 可能返回 ISO 时间戳（2026-11-08T00:00:00.000Z），截取日期部分
      form.logDate = String(existing.log_date).slice(0, 10);
      form.projectId = existing.project_id || undefined;
      form.hours = existing.hours ?? 8;
      form.content = existing.content;
      form.aiProvider = existing.ai_provider || '';
      optimizedContent.value = existing.optimized_content || '';
      // 回填已标记的小组（工时不再按组分配）
      // nextTick：等 projectId 变化的 watcher（清空小组选择）先执行完毕
      if (existing.group_marks?.length) {
        nextTick(() => {
          groupSelection.value = existing.group_marks!.map((m) => m.groupId);
        });
      }
    }
  }
});

onUnmounted(stopReviewSteps);

async function handleOptimize() {
  if (!form.content?.trim()) {
    ElMessage.warning('请先填写日志内容');
    return;
  }
  optimizing.value = true;
  try {
    // 上下文头：供提示词按标准模板回填姓名/日期/项目/小组/投入时长
    const proj = projects.value.find((p) => p.id === form.projectId);
    const groupNames = groupSelection.value
      .map((gid) => projectGroups.value.find((g) => g.id === gid)?.name || '')
      .filter(Boolean);
    const ctx = [
      `姓名：${userStore.user?.display_name || userStore.user?.username || '（待补充）'}`,
      `日期：${form.logDate}`,
      form.projectId ? `项目名称：${proj?.name || '（待补充）'}` : '',
      groupNames.length ? `小组名称：${groupNames.join('、')}` : '',
      `投入时长：${form.hours ?? 0}小时`,
    ]
      .filter(Boolean)
      .join('\n');
    const res = await logApi.optimize({
      content: `${ctx}\n\n工作内容：\n${form.content}`,
      provider: aiProvider.value,
      promptId: selectedPromptId.value,
    });
    optimizedContent.value = res.data.optimizedContent;
    form.aiProvider = res.data.provider;
    resultView.value = 'preview';
    ElMessage.success('AI 优化完成');
  } finally {
    optimizing.value = false;
  }
}

async function copyOptimized() {
  try {
    await navigator.clipboard.writeText(optimizedContent.value);
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.warning('复制失败，请手动选择复制');
  }
}

async function handleSave() {
  if (!form.projectId) {
    ElMessage.warning('请选择所属项目');
    return;
  }
  if (!form.logDate) {
    ElMessage.warning('请选择日志日期');
    return;
  }
  // 未使用 AI 优化时提醒用户确认（防遗忘；不想用 AI 的用户可选择直接保存）
  if (!optimizedContent.value?.trim()) {
    let action = 'close';
    try {
      await ElMessageBox.confirm(
        '当前日志尚未使用 AI 优化，保存后将以原始内容存档（可能影响报告生成质量）。\nAI 优化会按标准日志模板自动整理：项目/小组/事项成果/明日计划/问题与风险。建议先优化。',
        '未使用 AI 优化',
        {
          type: 'warning',
          confirmButtonText: '去优化',
          cancelButtonText: '不优化，直接保存',
          distinguishCancelAndClose: true,
        }
      );
      action = 'optimize';
    } catch (act) {
      action = String(act); // 'cancel'（不优化直接保存）/ 'close'（关闭弹窗）
    }
    if (action === 'optimize') {
      // 触发 AI 优化并中止本次保存，用户预览优化结果后再自行保存
      try {
        await handleOptimize();
      } catch {
        // 优化失败（无可用 Key 等），错误提示已由请求层展示
      }
      return;
    }
    if (action !== 'cancel') {
      return; // 关闭弹窗视为取消保存
    }
  }
  // 开始质检：弹窗内展示进度，完成后由用户确认保存或返回修改
  reviewing.value = true;
  reviewResult.value = null;
  reviewVisible.value = true;
  startReviewSteps();
  try {
    const res = await logApi.review({
      date: form.logDate,
      content: optimizedContent.value?.trim() || form.content,
      provider: aiProvider.value,
    });
    reviewResult.value = res.data;
    stopReviewSteps();
  } catch {
    stopReviewSteps();
    // 质检失败：关闭弹窗，由用户选择是否跳过直接保存
    reviewVisible.value = false;
    reviewing.value = false;
    try {
      await ElMessageBox.confirm('AI 质检服务暂时不可用，是否跳过质检直接保存？', '质检失败', {
        type: 'warning',
        confirmButtonText: '直接保存',
        cancelButtonText: '取消',
      });
    } catch {
      return;
    }
    await doSave(); // 跳过质检，无分数直接保存
  }
}

/** 质检确认后的真正保存（质检分数随日志一并入库） */
async function doSave() {
  saving.value = true;
  try {
    await logApi.save({
      logDate: form.logDate,
      projectId: form.projectId,
      content: form.content,
      optimizedContent: optimizedContent.value || undefined,
      aiProvider: form.aiProvider || undefined,
      hours: form.hours,
      groups: groupSelection.value.map((gid) => ({
        groupId: gid,
        hours: null,
      })),
      aiScore: reviewResult.value?.score ?? undefined,
    });
    reviewVisible.value = false;
    ElMessage.success('日志保存成功');
    if (isEdit.value) {
      // 编辑模式：保存后返回日志列表
      router.push('/logs');
      return;
    }
    form.content = '';
    optimizedContent.value = '';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
/* 卡片标题装饰条（与项目详情等页面风格统一） */
.card-title {
  position: relative;
  font-weight: 600;
  padding-left: 10px;
}

.card-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, #409eff, #7b5cff);
}

.optimize-card {
  margin-bottom: 16px;
}

.optimize-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-settings {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: var(--bg-page, #f5f7fa);
  border-radius: 8px;
}

.ai-warning {
  margin-bottom: 12px;
}

.optimize-btn {
  width: 100%;
  margin-bottom: 14px;
}

.optimize-result {
  border-top: 1px dashed var(--border-light);
  padding-top: 12px;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-regular);
  margin-bottom: 8px;
}

.result-textarea :deep(.el-textarea__inner) {
  line-height: 1.7;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
}

.result-preview {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 4px 12px;
  min-height: 220px;
  max-height: 460px;
  overflow: auto;
  background: var(--el-bg-color);
}

.result-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.save-card .save-tip {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  margin-top: 8px;
}

/* ==================== 保存前质量检查弹窗 ==================== */
.review-loading {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 10px 0;
}

.review-spin {
  font-size: 38px;
  color: var(--primary-color, #409eff);
  animation: review-rotate 1s linear infinite;
}

@keyframes review-rotate {
  to {
    transform: rotate(360deg);
  }
}

.review-loading-text {
  text-align: center;
}

.review-loading-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.review-loading-step {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  animation: step-fade 0.5s ease;
}

@keyframes step-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.review-score-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.review-score {
  font-size: 22px;
  font-weight: 700;
  padding: 4px 16px;
  border-radius: 999px;
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

.review-pass {
  font-size: 13px;
  color: var(--text-secondary);
}

.review-summary {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-regular);
  background: var(--bg-page, #f5f7fa);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.review-sug-title {
  font-size: 13px;
  font-weight: 600;
  margin: 4px 0;
}

.review-sugs {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-regular);
  line-height: 1.8;
}

/* ==================== 填写要点气泡（与新版一致） ==================== */
.page-header .page-title {
  display: inline-flex;
  align-items: center;
}

.tips-trigger {
  margin-left: 6px;
  color: var(--primary-color, #409eff);
  cursor: help;
  font-size: 17px;
  vertical-align: -2px;
}

.tips-popover {
  font-size: 13px;
  color: var(--text-regular, #606266);
  line-height: 1.7;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 6px;
}

/* 气泡全局样式（popper 渲染在 body 下，需 popper-class 定制） */
:global(.tips-popover-popper) {
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1);
}

:global(.tips-popover-popper .tips-popover) {
  scrollbar-width: thin;
  scrollbar-color: #d4d7de transparent;
}

.tips-popover ol {
  padding-left: 18px;
  margin: 6px 0;
}

.tips-popover li {
  margin: 3px 0;
}

.tips-slogan {
  margin: 0 0 6px;
}

.tips-structure-title {
  margin: 0 0 4px;
  font-weight: 600;
}

.tips-table {
  width: 100%;
  border-collapse: collapse;
  margin: 4px 0 6px;
  font-size: 12px;
}

.tips-table th,
.tips-table td {
  border: 1px solid var(--border-color, #ebeef5);
  padding: 4px 8px;
  text-align: left;
}

.tips-table th {
  background: var(--bg-page, #f5f7fa);
  font-weight: 600;
}

.tips-template {
  margin: 6px 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg-page, #f5f7fa);
  border: 1px solid var(--border-color, #ebeef5);
  font-size: 12px;
  line-height: 1.8;
  font-family: inherit;
  white-space: pre-wrap;
  color: var(--text-secondary, #606266);
}

.tips-score-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-secondary, #909399);
  line-height: 1.8;
}

.tips-score-list li {
  margin: 4px 0;
}

.content-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.content-help {
  color: var(--text-placeholder, #a8abb2);
  cursor: help;
  font-size: 14px;
}

.content-help:hover {
  color: var(--primary-color, #409eff);
}
</style>
