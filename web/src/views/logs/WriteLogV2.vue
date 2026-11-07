<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-left">
        <div class="page-title">
          填写日志 · 新版
          <el-popover placement="bottom-start" :width="340" trigger="hover">
            <template #reference>
              <el-icon class="tips-trigger"><InfoFilled /></el-icon>
            </template>
            <div class="tips-popover">
              <p class="tips-slogan">
                标准：别人不看代码、不开会，也能知道你这天<strong>干了什么、干到什么程度、明天从哪继续</strong>。
              </p>
              <ol>
                <li><strong>做了什么</strong>：写清哪个功能模块或交付物做了什么工作，不写笼统词</li>
                <li><strong>进展结果</strong>：完成 / 进行中（百分比）/ 受阻，带可验证产出</li>
                <li><strong>工时投入</strong>：如实填写当天投入工时</li>
                <li><strong>问题与风险</strong>：卡点、需要的协助，早暴露早解决</li>
                <li><strong>明日计划</strong>：一两句话，让工作有连续性</li>
              </ol>
              <pre class="tips-template">【今日完成】登录模块联调完成，修复3个Bug
【进行中】订单导出优化（80%）
【问题】测试环境不稳定，等待运维处理
【明日计划】导出功能自测并提测</pre>
            </div>
          </el-popover>
        </div>
        <div class="page-desc">
          左侧维护今日待办，中间与 AI 对话生成日志（自动质量检查、追问补全），在对话里确认优化稿并保存
        </div>
      </div>
      <div class="header-tools">
        <el-date-picker
          v-model="logDate"
          type="date"
          placeholder="日志日期"
          value-format="YYYY-MM-DD"
          :disabled-date="disableOutOfRangeDate"
          :clearable="false"
          style="width: 140px"
        />
        <el-select v-model="provider" style="width: 130px">
          <el-option label="通义千问" value="qwen" :disabled="!providers.qwenConfigured" />
          <el-option label="DeepSeek" value="deepseek" :disabled="!providers.deepseekConfigured" />
        </el-select>
      </div>
    </div>

    <el-alert
      v-if="!providers.qwenConfigured && !providers.deepseekConfigured"
      title="尚未配置大模型服务，请联系管理员在系统设置中配置通义千问或 DeepSeek 的 API Key"
      type="warning"
      :closable="false"
      style="margin-bottom: 16px"
    />

    <el-row :gutter="16">
      <!-- 左：待办（干净清单，实时保存） -->
      <el-col :xs="24" :md="7">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-head-row">
              <span class="card-title">{{ logDate }} 待办</span>
              <el-tag size="small" type="info">实时保存</el-tag>
            </div>
          </template>

          <div class="todo-input-row">
            <el-input
              v-model="newTodoText"
              placeholder="添加一条待办，回车确认"
              @keyup.enter="addTodo"
            />
            <el-button type="primary" size="small" @click="addTodo">添加</el-button>
          </div>

          <div v-if="todos.length" class="todo-list">
            <div v-for="(t, i) in todos" :key="i" class="todo-item" :class="{ done: t.status === 'done' }">
              <el-checkbox
                :model-value="t.status === 'done'"
                @change="(v: any) => toggleTodo(i, !!v)"
              />
              <span class="todo-content">{{ t.content }}</span>
              <el-button link type="danger" size="small" @click="removeTodo(i)">删除</el-button>
            </div>
          </div>
          <el-empty v-else description="暂无待办，先添加今天的任务" :image-size="50" />
        </el-card>
      </el-col>

      <!-- 右：今日日志 · AI 对话（主区） -->
      <el-col :xs="24" :md="17">
        <el-card shadow="never" class="block-card chat-card">
          <template #header>
            <div class="card-head-row">
              <span class="card-title">今日日志 · AI 对话</span>
              <div class="quick-actions">
                <el-button
                  type="primary"
                  size="small"
                  :loading="assisting"
                  :disabled="aiUnavailable"
                  @click="startGenerate"
                >
                  <el-icon><MagicStick /></el-icon>自动生成日志
                </el-button>
                <el-button size="small" @click="openMyLogs">
                  <el-icon><Document /></el-icon>我的日志
                </el-button>
              </div>
            </div>
          </template>

          <div class="chat-body" ref="chatBodyEl">
            <div v-for="(m, i) in messages" :key="i" class="chat-msg" :class="m.role">
              <div class="chat-bubble">
                <MdPreview v-if="m.role === 'assistant'" :content="m.text" />
                <template v-else>{{ m.text }}</template>

                <!-- 优化后的日志卡片（内嵌在 AI 回复里） -->
                <div v-if="m.logResult" class="log-result-card">
                  <div class="result-toolbar">
                    <el-radio-group v-model="m.viewMode" size="small">
                      <el-radio-button value="preview">预览</el-radio-button>
                      <el-radio-button value="edit">编辑</el-radio-button>
                    </el-radio-group>
                  </div>
                  <div v-if="m.viewMode === 'preview'" class="result-preview">
                    <MdPreview :content="m.logResult.content" />
                  </div>
                  <el-input
                    v-else
                    v-model="m.logResult.content"
                    type="textarea"
                    :rows="12"
                    class="result-textarea"
                  />
                  <div v-if="m.logResult.groups && m.logResult.groups.length" class="group-note">
                    识别小组：{{ m.logResult.groups.map((g) => g.name).join('、') }}
                  </div>
                  <el-button
                    type="success"
                    style="width: 100%; margin-top: 12px"
                    :loading="saving"
                    :disabled="!m.logResult.content"
                    @click="saveLog()"
                  >
                    <el-icon><Check /></el-icon>确认保存日志
                  </el-button>
                </div>
              </div>
            </div>

            <el-empty
              v-if="!messages.length"
              description="点击右上角「自动生成日志」，AI 将根据左侧待办执行情况帮你起草今日日志"
              :image-size="70"
            />

            <!-- 待回答的质量检查问题 -->
            <div v-if="pendingQuestions.length" class="qa-panel">
              <div class="qa-title">质量检查发现以下信息需要补充：</div>
              <div v-for="(q, qi) in pendingQuestions" :key="qi" class="qa-item">
                <div class="qa-question">{{ qi + 1 }}. {{ q.question }}</div>
                <template v-if="q.options && q.options.length">
                  <el-radio-group v-model="qaAnswers[qi].choice" class="qa-options">
                    <el-radio v-for="opt in q.options" :key="opt" :value="opt">{{ opt }}</el-radio>
                    <el-radio value="__other__">其他（自行填写）</el-radio>
                  </el-radio-group>
                  <el-input
                    v-if="qaAnswers[qi].choice === '__other__'"
                    v-model="qaAnswers[qi].other"
                    placeholder="请输入其他内容"
                    style="margin-top: 6px"
                  />
                </template>
                <el-input v-else v-model="qaAnswers[qi].choice" placeholder="请输入你的回答" />
              </div>
              <el-button type="primary" size="small" :loading="assisting" @click="submitAnswers">
                提交回答
              </el-button>
            </div>
          </div>

          <div class="chat-input-area">
            <el-input
              v-model="draftInput"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 4 }"
              placeholder="补充说明：今天具体做了什么、有什么成果…（Enter 发送，Shift+Enter 换行）"
              @keydown.enter.exact.prevent="sendDraft"
            />
            <el-button
              type="primary"
              class="send-btn"
              :loading="assisting"
              :disabled="!draftInput.trim()"
              @click="sendDraft"
            >
              发送
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 我的日志（最近 5 条，内容可折叠） -->
    <el-drawer v-model="logsDrawerVisible" title="我的日志（最近 5 条）" size="480px">
      <div v-if="recentLogs.length" class="recent-logs">
        <el-collapse>
          <el-collapse-item v-for="log in recentLogs" :key="log.id">
            <template #title>
              <div class="recent-log-title">
                {{ (log.log_date || '').slice(0, 10) }} 的日志
                <el-tag
                  v-if="log.optimized_content"
                  size="small"
                  type="success"
                  style="margin-left: 8px"
                >已优化</el-tag>
              </div>
            </template>
            <MdPreview :content="log.optimized_content || log.content || ''" />
          </el-collapse-item>
        </el-collapse>
      </div>
      <el-empty v-else description="还没有写过日志" :image-size="70" />
      <div class="drawer-footer">
        <el-button type="primary" plain size="small" @click="router.push('/logs')">
          查看全部日志
        </el-button>
      </div>
    </el-drawer>

    <!-- 项目归属确认（AI 未识别出项目时的兜底） -->
    <el-dialog v-model="saveDialogVisible" title="选择日志所属项目" width="400px">
      <p style="margin-top: 0">
        一天一条日志，归属一个项目。AI 未能从内容中识别出项目，请手动选择：
      </p>
      <el-select v-model="dialogProjectId" placeholder="请选择项目" style="width: 100%">
        <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <template #footer>
        <el-button @click="saveDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!dialogProjectId" :loading="saving" @click="doSave(dialogProjectId!)">
          确认保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { chatApi, logApi, projectApi, todoApi, type TodoItem } from '../../api';
import { currentWeekMonday } from '../../utils/date';
import MdPreview from '../../components/MdPreview.vue';
import type { Project, WorkLog } from '../../types';

const router = useRouter();

const projects = ref<Project[]>([]);
const todos = ref<TodoItem[]>([]);
const newTodoText = ref('');

// 日志日期（默认今天，限本周；value-format 保证始终为 YYYY-MM-DD 字符串）与模型
const today = new Date();
const logDate = ref(
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
);
const provider = ref<'qwen' | 'deepseek'>('qwen');
const providers = reactive({ qwenConfigured: false, deepseekConfigured: false });

// 可选日期：本周一 ~ 本周日（与日志规则一致）
const mondayTime = new Date(currentWeekMonday() + 'T00:00:00').getTime();
const sundayTime = mondayTime + 6 * 24 * 3600 * 1000;
function disableOutOfRangeDate(d: Date): boolean {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return t < mondayTime || t > sundayTime;
}

const aiUnavailable = computed(() => !providers.qwenConfigured && !providers.deepseekConfigured);

// 对话与质量检查
interface AssistResult {
  project?: string;
  content: string;
  hours: number | null;
  groups: { name: string; hours: number | null }[];
}
interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  logResult?: AssistResult | null;
  viewMode?: 'preview' | 'edit';
}
const messages = ref<ChatMsg[]>([]);
const history = ref<{ role: 'user' | 'assistant'; content: string }[]>([]);
const draftInput = ref('');
const pendingQuestions = ref<any[]>([]);
const qaAnswers = ref<Record<number, { choice: string; other: string }>>({});
const assisting = ref(false);
const saving = ref(false);
const chatBodyEl = ref<HTMLElement | null>(null);

// 当前最新的日志优化稿（供保存使用；与对话消息内卡片同一引用）
const result = ref<AssistResult | null>(null);

// 我的日志抽屉
const logsDrawerVisible = ref(false);
const recentLogs = ref<WorkLog[]>([]);

// 保存时的项目兜底弹窗
const saveDialogVisible = ref(false);
const dialogProjectId = ref<number | undefined>(undefined);

const projectGroups = computed(
  () => projects.value.find((p) => p.id === (dialogProjectId.value || 0))?.groups || []
);

onMounted(async () => {
  const [projectRes, providerRes, todoRes] = await Promise.all([
    projectApi.list(),
    chatApi.providers().catch(() => null),
    todoApi.list(logDate.value).catch(() => null),
  ]);
  projects.value = projectRes.data || [];
  if (providerRes) {
    providers.qwenConfigured = providerRes.data.qwenConfigured;
    providers.deepseekConfigured = providerRes.data.deepseekConfigured;
    if (!providers.qwenConfigured && providers.deepseekConfigured) provider.value = 'deepseek';
  }
  todos.value = todoRes?.data || [];
});

watch(logDate, () => {
  loadTodos();
  if (messages.value.length || result.value) {
    messages.value = [];
    history.value = [];
    result.value = null;
    pendingQuestions.value = [];
  }
});

async function loadTodos() {
  try {
    const res = await todoApi.list(logDate.value);
    todos.value = res.data || [];
  } catch {
    todos.value = [];
  }
}

/** 待办实时保存（整份替换） */
async function persistTodos() {
  try {
    const res = await todoApi.save({
      date: logDate.value,
      items: todos.value.map((t) => ({ content: t.content, status: t.status })),
    });
    todos.value = res.data || [];
  } catch {
    ElMessage.error('待办保存失败，请重试');
  }
}

function addTodo() {
  const c = newTodoText.value.trim();
  if (!c) return;
  todos.value.push({ id: 0, content: c, status: 'pending', sort_order: todos.value.length });
  newTodoText.value = '';
  persistTodos();
}

function removeTodo(i: number) {
  todos.value.splice(i, 1);
  persistTodos();
}

function toggleTodo(i: number, val: boolean) {
  todos.value[i].status = val ? 'done' : 'pending';
  persistTodos();
}

function startGenerate() {
  if (aiUnavailable.value) {
    ElMessage.warning('尚未配置可用的大模型，请联系管理员');
    return;
  }
  messages.value.push({ role: 'user', text: '根据今日待办和执行情况，帮我生成今天的日志。' });
  history.value = [];
  result.value = null;
  pendingQuestions.value = [];
  runAssist();
}

async function runAssist() {
  assisting.value = true;
  try {
    const res = await logApi.assist({
      date: logDate.value,
      projectId: null,
      todos: todos.value.map((t) => ({ content: t.content, status: t.status })),
      history: history.value,
      provider: provider.value,
    });
    const data: any = (res as any).data;
    if (data.action === 'done' && data.result) {
      result.value = data.result;
      pendingQuestions.value = [];
      messages.value.push({
        role: 'assistant',
        text: '✅ 质量检查通过，日志已按「好日志规范」优化生成。\n\n请在下方卡片中检查确认，可直接编辑，确认无误后点击「确认保存日志」。',
        logResult: data.result,
        viewMode: 'preview',
      });
      history.value.push({
        role: 'assistant',
        content: '质量检查通过，日志已优化生成，请在卡片中确认保存。',
      });
    } else {
      pendingQuestions.value = data.questions || [];
      qaAnswers.value = {};
      pendingQuestions.value.forEach((_q, i) => {
        qaAnswers.value[i] = { choice: '', other: '' };
      });
      const qtext = pendingQuestions.value
        .map(
          (q: any, i: number) =>
            `${i + 1}. ${q.question}${q.options?.length ? `（选项：${q.options.join(' / ')}）` : ''}`
        )
        .join('\n');
      messages.value.push({
        role: 'assistant',
        text: '🔍 质量检查发现以下信息需要补充：\n\n' + qtext,
      });
      history.value.push({ role: 'assistant', content: '请补充以下信息：\n' + qtext });
    }
    await nextTick();
    chatBodyEl.value?.scrollTo({ top: chatBodyEl.value.scrollHeight, behavior: 'smooth' });
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '网络异常';
    ElMessage.error('生成失败：' + msg);
    messages.value.push({ role: 'assistant', text: '⚠️ 生成失败：' + msg + '\n\n请检查模型配置后重试。' });
  } finally {
    assisting.value = false;
  }
}

async function submitAnswers() {
  const ansText = pendingQuestions.value
    .map((_q, i) => {
      const a = qaAnswers.value[i] || { choice: '', other: '' };
      if (a.choice === '__other__') return `${i + 1}. 其他：${a.other || '（未填写）'}`;
      return `${i + 1}. ${a.choice || a.other || '（未回答）'}`;
    })
    .join('\n');
  messages.value.push({ role: 'user', text: '我的回答：\n' + ansText });
  history.value.push({ role: 'user', content: '我的回答：\n' + ansText });
  pendingQuestions.value = [];
  runAssist();
}

async function sendDraft() {
  const d = draftInput.value.trim();
  if (!d || assisting.value) return;
  draftInput.value = '';
  messages.value.push({ role: 'user', text: d });
  history.value.push({ role: 'user', content: '补充说明：' + d });
  runAssist();
}

async function openMyLogs() {
  try {
    const res = await logApi.list({ page: 1, pageSize: 5 });
    recentLogs.value = (res.data as any)?.list || [];
  } catch {
    recentLogs.value = [];
  }
  logsDrawerVisible.value = true;
}

async function saveLog() {
  if (!result.value?.content) {
    ElMessage.warning('请先生成日志');
    return;
  }
  // 项目归属：优先用 AI 识别的项目名匹配用户项目列表；匹配不到弹窗兜底
  const name = (result.value.project || '').trim();
  const matched = name ? projects.value.find((p) => p.name === name) : null;
  if (matched) {
    await doSave(matched.id);
  } else {
    dialogProjectId.value = undefined;
    saveDialogVisible.value = true;
  }
}

async function doSave(pid: number) {
  // 原始内容：保留待办执行情况作为原始依据
  const content =
    '今日待办执行情况：' +
    todos.value.map((t) => `${t.status === 'done' ? '[完成]' : '[未完成]'}${t.content}`).join('；');

  // AI 识别的小组名 → 项目小组 id 映射（工时在项目级，由 AI 从内容推断，可空）
  const groups = (result.value?.groups || [])
    .map((g) => {
      const grp = projectGroups.value.find((pg) => pg.name === g.name);
      return grp ? { groupId: grp.id } : null;
    })
    .filter((x): x is { groupId: number } => !!x);

  saving.value = true;
  try {
    await logApi.save({
      logDate: logDate.value,
      projectId: pid,
      content,
      optimizedContent: result.value!.content,
      aiProvider: provider.value,
      hours: result.value!.hours ?? undefined,
      groups,
    });
    saveDialogVisible.value = false;
    ElMessage.success('日志保存成功');
    router.push('/logs');
  } catch (e: any) {
    ElMessage.error('保存失败：' + (e?.response?.data?.message || e?.message || '网络异常'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 10px;
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

.tips-template {
  margin: 8px 0 0;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

.card-title {
  font-weight: 600;
}

.block-card {
  margin-bottom: 16px;
}

.card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

/* 待办 */
.todo-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.todo-list {
  max-height: calc(100vh - 380px);
  overflow-y: auto;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  margin-bottom: 6px;
}

.todo-item .todo-content {
  flex: 1;
  font-size: 13px;
  word-break: break-all;
}

.todo-item.done .todo-content {
  text-decoration: line-through;
  color: var(--text-secondary, #909399);
}

/* 快捷操作 */
.quick-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-actions .el-button + .el-button {
  margin-left: 0;
}

/* 对话区（AI 助手风格） */
.chat-card {
  display: flex;
  flex-direction: column;
}

.chat-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.chat-body {
  flex: 1;
  height: calc(100vh - 400px);
  min-height: 480px;
  overflow-y: auto;
  padding: 12px 10px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-blank, #fff);
}

.chat-msg {
  display: flex;
  margin-bottom: 14px;
}

.chat-msg.user {
  justify-content: flex-end;
}

.chat-msg.assistant {
  justify-content: flex-start;
}

.chat-bubble {
  max-width: 88%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.65;
  word-break: break-all;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.chat-msg.user .chat-bubble {
  background: var(--primary-color, #409eff);
  color: #fff;
  white-space: pre-wrap;
  border-bottom-right-radius: 3px;
}

.chat-msg.assistant .chat-bubble {
  background: var(--el-fill-color-light);
  color: var(--text-primary, #303133);
  border-bottom-left-radius: 3px;
}

/* AI 气泡内的 Markdown 适配 */
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body) {
  font-size: 13.5px;
  line-height: 1.65;
}

.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body p) {
  margin: 4px 0;
}

.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body ol),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body ul) {
  padding-left: 18px;
  margin: 4px 0;
}

.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h1),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h2),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h3),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h4),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body p:first-child) {
  margin-top: 0;
}

.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h1),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h2),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h3),
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body h4) {
  margin-bottom: 0;
}

/* 内嵌的优化日志卡片 */
.log-result-card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border-color, #e4e7ed);
  border-radius: 10px;
  background: var(--el-bg-color, #fff);
}

.result-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.result-preview {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 6px 14px;
  min-height: 160px;
  max-height: 420px;
  overflow: auto;
  background: var(--el-bg-color, #fff);
}

.result-textarea :deep(.el-textarea__inner) {
  line-height: 1.7;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
}

.group-note {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

/* 质量检查问答面板 */
.qa-panel {
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e4e7ed);
  border-radius: 8px;
  background: var(--bg-hover, #f8f9fb);
}

.qa-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.qa-item {
  margin-bottom: 10px;
}

.qa-question {
  font-size: 13px;
  margin-bottom: 6px;
  color: var(--text-primary, #303133);
}

.qa-options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

/* 输入区（参考 AI 助手） */
.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.chat-input-area .el-input {
  flex: 1;
}

.chat-input-area :deep(.el-textarea__inner) {
  border-radius: 10px;
  padding: 9px 12px;
  line-height: 1.6;
}

.send-btn {
  height: 38px;
  border-radius: 10px;
  padding: 0 20px;
}

/* 我的日志抽屉 */
.recent-log-title {
  font-size: 14px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
}

.drawer-footer {
  margin-top: 14px;
  text-align: center;
}

@media (max-width: 768px) {
  .chat-body {
    height: auto;
    min-height: 320px;
    max-height: 60vh;
  }

  .todo-list {
    max-height: 300px;
  }
}
</style>
