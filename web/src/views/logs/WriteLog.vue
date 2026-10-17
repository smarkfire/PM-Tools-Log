<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">{{ isEdit ? `编辑日志（${form.logDate}）` : '填写日志' }}</div>
      <div class="page-desc">
        {{ isEdit
          ? '修改已有日志并保存；超过本周的修改需上级审批通过后才可提交'
          : '可填写本周任意一天的工作日志，支持通义千问 / DeepSeek AI 优化' }}
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 编辑区 -->
      <el-col :xs="24" :md="14">
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
              <el-col v-if="form.projectId && projectGroups.length" :span="24">
                <el-form-item label="涉及小组（可多选，工时按组分配）">
                  <el-select
                    v-model="groupSelection"
                    multiple
                    clearable
                    placeholder="选择本篇日志涉及的小组（可选）"
                    style="width: 100%"
                  >
                    <el-option v-for="g in projectGroups" :key="g.id" :label="g.name" :value="g.id" />
                  </el-select>
                  <div v-if="groupSelection.length" class="group-hours-list">
                    <div v-for="gid in groupSelection" :key="gid" class="group-hours-row">
                      <span class="group-hours-name">{{ groupNameOf(gid) }}</span>
                      <el-input-number
                        v-model="groupHoursMap[gid]"
                        :min="0"
                        :max="24"
                        :step="0.5"
                        size="small"
                        controls-position="right"
                      />
                      <span class="group-hours-unit">h</span>
                    </div>
                    <div
                      class="group-hours-tip"
                      :class="{ 'group-hours-exceed': groupHoursExceeded }"
                    >
                      <template v-if="groupHoursExceeded">
                        各小组工时之和（{{ groupHoursSum }}h）已超过当天总工时（{{ form.hours ?? 0 }}h），请调整
                      </template>
                      <template v-else>
                        默认按总工时均摊到各组，可按实际投入修改；已分配 {{ groupHoursSum }}h / {{ form.hours ?? 0 }}h
                      </template>
                    </div>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 填写要点（可折叠，记住展开状态） -->
            <el-collapse v-model="tipsVisible" class="write-tips">
              <el-collapse-item name="open">
                <template #title>
                  <span class="write-tips-title">
                    <el-icon><InfoFilled /></el-icon>
                    填写要点：什么样的日志算好日志？
                  </span>
                </template>
                <div class="write-tips-body">
                  <p class="write-tips-slogan">
                    标准：别人不看代码、不开会，也能知道你这天<strong>干了什么、干到什么程度、明天从哪继续</strong>。
                  </p>
                  <ol>
                    <li><strong>做了什么</strong>：具体到任务，不写笼统词——写“修复订单导出超时，改用分页查询”，别写“处理了些开发工作”</li>
                    <li><strong>进展结果</strong>：完成 / 进行中（百分比）/ 受阻，带可验证产出（接口数、用例数、Bug 编号）</li>
                    <li><strong>工时投入</strong>：如实填写，跨组工作按组分配，这是统计与报告的数据基础</li>
                    <li><strong>问题风险</strong>：卡点、需要谁协助、有何风险——问题早暴露一天，损失就小一分</li>
                    <li><strong>后续计划</strong>：一两句话即可，让工作有连续性</li>
                  </ol>
                  <pre class="write-tips-template">【今日完成】登录模块联调完成，修复3个Bug
【进行中】订单导出优化（80%）
【问题】测试环境数据库不稳定，等待运维处理
【明日计划】导出功能自测并提测</pre>
                </div>
              </el-collapse-item>
            </el-collapse>

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
      <el-col :xs="24" :md="10">
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
            :loading="saving"
            :disabled="!form.content?.trim() || !form.projectId || groupHoursExceeded"
            @click="handleSave"
          >
            <el-icon><Check /></el-icon>
            保存日志
          </el-button>
          <div class="save-tip">
            保存时将同时提交原始内容与优化后内容
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
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

// 编辑模式：?date=YYYY-MM-DD 时加载当天已有日志
const editDate = computed(() => (route.query.date as string) || '');
const isEdit = computed(() => !!editDate.value);

// 填写要点折叠面板（记住展开状态）
const TIPS_KEY = 'matelog_write_tips_open';
const tipsVisible = ref<string[]>(localStorage.getItem(TIPS_KEY) === '1' ? ['open'] : []);
watch(tipsVisible, (v) => localStorage.setItem(TIPS_KEY, v.includes('open') ? '1' : '0'));

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

// ===== 跨组协作：涉及小组多选 + 各组投入工时 =====
const groupSelection = ref<number[]>([]);
const groupHoursMap = reactive<Record<number, number | undefined>>({});

// 当前所选项目下的小组（需为项目成员才可标记，由后端校验）
const projectGroups = computed(() => {
  const p = projects.value.find((item) => item.id === form.projectId);
  return p?.groups || [];
});

function groupNameOf(gid: number): string {
  return projectGroups.value.find((g) => g.id === gid)?.name || `小组#${gid}`;
}

// 切换项目时清空小组选择
watch(
  () => form.projectId,
  () => {
    groupSelection.value = [];
    Object.keys(groupHoursMap).forEach((k) => delete groupHoursMap[Number(k)]);
  }
);

// 新增勾选小组时按总工时均摊预填（已有的不覆盖，可手动修改）
watch(groupSelection, (ids) => {
  const n = ids.length;
  if (!n) return;
  const even = form.hours != null ? Math.round((form.hours / n) * 10) / 10 : undefined;
  ids.forEach((id) => {
    if (groupHoursMap[id] == null) groupHoursMap[id] = even;
  });
});

// 各小组工时之和（未填写的按总工时均摊估算，与保存逻辑一致）
const groupHoursSum = computed(() => {
  const n = groupSelection.value.length;
  if (!n) return 0;
  const even = form.hours != null ? Math.round((form.hours / n) * 10) / 10 : 0;
  const sum = groupSelection.value.reduce(
    (s, gid) => s + (groupHoursMap[gid] != null ? (groupHoursMap[gid] as number) : even),
    0
  );
  return Math.round(sum * 10) / 10;
});

// 校验：各小组工时之和不能大于当天总工时
const groupHoursExceeded = computed(
  () => groupSelection.value.length > 0 && groupHoursSum.value > (form.hours ?? 0)
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
      form.logDate = existing.log_date;
      form.projectId = existing.project_id || undefined;
      form.hours = existing.hours ?? 8;
      form.content = existing.content;
      form.aiProvider = existing.ai_provider || '';
      optimizedContent.value = existing.optimized_content || '';
      // 回填已标记的小组与各组工时
      // nextTick：等 projectId 变化的 watcher（清空小组选择）先执行完毕
      if (existing.group_marks?.length) {
        nextTick(() => {
          groupSelection.value = existing.group_marks!.map((m) => m.groupId);
          existing.group_marks!.forEach((m) => {
            groupHoursMap[m.groupId] = m.hours ?? undefined;
          });
        });
      }
    }
  }
});

async function handleOptimize() {
  if (!form.content?.trim()) {
    ElMessage.warning('请先填写日志内容');
    return;
  }
  optimizing.value = true;
  try {
    const res = await logApi.optimize({
      content: form.content,
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
  if (groupHoursExceeded.value) {
    ElMessage.warning(
      `各小组工时之和（${groupHoursSum.value}h）不能大于当天总工时（${form.hours ?? 0}h）`
    );
    return;
  }
  // 未使用 AI 优化时提醒用户确认（防遗忘；不想用 AI 的用户可选择直接保存）
  if (!optimizedContent.value?.trim()) {
    let action = 'close';
    try {
      await ElMessageBox.confirm(
        '当前日志尚未使用 AI 优化，保存后将以原始内容存档（可能影响报告生成质量）。\nAI 优化会按五要素自动整理：完成事项、进展结果、工时投入、问题风险、后续计划。建议先优化。',
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
        hours: groupHoursMap[gid] ?? null,
      })),
    });
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
.card-title {
  font-weight: 600;
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

/* 跨组协作：各小组工时分配 */
.group-hours-list {
  width: 100%;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: var(--radius-base);
}

.group-hours-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.group-hours-name {
  flex: 1;
  font-size: 13px;
}

.group-hours-unit {
  font-size: 13px;
  color: var(--text-secondary);
}

.group-hours-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.group-hours-exceed {
  color: var(--danger-color);
  font-weight: 500;
}

/* ==================== 填写要点 ==================== */
.write-tips {
  margin-bottom: 18px;
  border: 1px dashed var(--border-color, #dcdfe6);
  border-radius: 8px;
  background: var(--bg-hover, #f8f9fb);
}

.write-tips :deep(.el-collapse-item__header) {
  padding: 0 12px;
  background: transparent;
}

.write-tips :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom: none;
}

.write-tips :deep(.el-collapse-item__content) {
  padding: 0 16px 14px;
}

.write-tips-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-color, #409eff);
}

.write-tips-body {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary, #606266);
}

.write-tips-slogan {
  margin: 0 0 6px;
}

.write-tips-body ol {
  margin: 6px 0;
  padding-left: 20px;
}

.write-tips-body strong {
  color: var(--text-primary, #303133);
}

.write-tips-template {
  margin: 8px 0 0;
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
