<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">填写日志 · 新版</div>
      <div class="page-desc">
        左侧维护今日待办，中间与 AI 对话生成今日日志（自动质量检查、追问补全），右侧确认优化稿并保存
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 左：今日待办（干净清单，实时保存） -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-head-row">
              <span class="card-title">今日待办</span>
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

      <!-- 中：今日日志（AI 对话 + 质量检查） -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="block-card chat-card">
          <template #header>
            <div class="card-head-row">
              <span class="card-title">今日日志</span>
              <el-select
                v-model="projectId"
                placeholder="选择项目（必填）"
                size="small"
                style="width: 150px"
              >
                <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </div>
          </template>

          <!-- 常用操作 -->
          <div class="quick-actions">
            <el-button
              type="primary"
              size="small"
              :loading="assisting"
              :disabled="!projectId"
              @click="startGenerate"
            >
              <el-icon><MagicStick /></el-icon>自动生成日志
            </el-button>
            <el-button size="small" @click="router.push('/logs')">
              <el-icon><Document /></el-icon>我的日志
            </el-button>
            <el-button size="small" @click="router.push('/todos')">
              <el-icon><List /></el-icon>历史待办
            </el-button>
          </div>

          <!-- 填写要点（与旧版一致，记住展开状态） -->
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
                  <li><strong>做了什么</strong>：写清哪个功能模块或交付物做了什么工作，不写笼统词</li>
                  <li><strong>进展结果</strong>：完成 / 进行中（百分比）/ 受阻，带可验证产出</li>
                  <li><strong>工时投入</strong>：如实填写当天投入工时</li>
                  <li><strong>问题与风险</strong>：卡点、需要的协助，早暴露早解决</li>
                  <li><strong>明日计划</strong>：一两句话，让工作有连续性</li>
                </ol>
                <pre class="write-tips-template">【今日完成】登录模块联调完成，修复3个Bug
【进行中】订单导出优化（80%）
【问题】测试环境不稳定，等待运维处理
【明日计划】导出功能自测并提测</pre>
              </div>
            </el-collapse-item>
          </el-collapse>

          <!-- 对话区 -->
          <div class="chat-body">
            <div v-for="(m, i) in messages" :key="i" class="chat-msg" :class="m.role">
              <div class="chat-bubble">
                <MdPreview v-if="m.role === 'assistant'" :content="m.text" />
                <template v-else>{{ m.text }}</template>
              </div>
            </div>

            <el-empty
              v-if="!messages.length"
              description="点击上方「自动生成日志」，AI 将根据待办执行情况帮你起草"
              :image-size="60"
            />

            <!-- 待回答的质量检查问题 -->
            <div v-if="pendingQuestions.length" class="qa-panel">
              <div class="qa-title">质量检查发现以下信息需要补充：</div>
              <div v-for="(q, qi) in pendingQuestions" :key="qi" class="qa-item">
                <div class="qa-question">{{ q.question }}</div>
                <el-radio-group v-if="q.options && q.options.length" v-model="qaAnswers[qi]" class="qa-options">
                  <el-radio v-for="opt in q.options" :key="opt" :value="opt">{{ opt }}</el-radio>
                </el-radio-group>
                <el-input v-else v-model="qaAnswers[qi]" placeholder="请输入你的回答" />
              </div>
              <el-button type="primary" size="small" :loading="assisting" @click="submitAnswers">
                提交回答
              </el-button>
            </div>
          </div>

          <div class="chat-input-row">
            <el-input
              v-model="draftInput"
              placeholder="补充说明：今天具体做了什么、有什么成果…"
              @keyup.enter="sendDraft"
            />
            <el-button type="primary" size="small" @click="sendDraft">补充</el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 右：优化后的日志 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="block-card">
          <template #header>
            <div class="card-head-row">
              <span class="card-title">优化后的日志</span>
              <el-tag v-if="result" size="small" type="success">已优化</el-tag>
            </div>
          </template>

          <div v-if="result" class="result-area">
            <div class="result-toolbar">
              <el-radio-group v-model="resultView" size="small">
                <el-radio-button value="edit">编辑</el-radio-button>
                <el-radio-button value="preview">预览</el-radio-button>
              </el-radio-group>
            </div>

            <el-input
              v-if="resultView === 'edit'"
              v-model="result.content"
              type="textarea"
              :rows="16"
              class="result-textarea"
            />
            <div v-else class="result-preview">
              <MdPreview :content="result.content" />
            </div>

            <div v-if="result.groups && result.groups.length" class="group-note">
              识别到的小组：{{ result.groups.map((g) => g.name).join('、') }}
            </div>

            <el-button
              type="success"
              size="large"
              style="width: 100%; margin-top: 14px"
              :loading="saving"
              :disabled="!result.content"
              @click="saveLog"
            >
              <el-icon><Check /></el-icon>确认保存日志
            </el-button>
          </div>
          <el-empty v-else description="质量检查通过并优化后，日志在此显示" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { logApi, projectApi, todoApi, type TodoItem } from '../../api';
import MdPreview from '../../components/MdPreview.vue';
import type { Project } from '../../types';

const router = useRouter();

const projects = ref<Project[]>([]);
const todos = ref<TodoItem[]>([]);
const newTodoText = ref('');

// 日志固定为今天；项目在中间栏选择
const today = new Date();
const logDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const projectId = ref<number | undefined>(undefined);

// 填写要点折叠面板（记住展开状态，与旧版共用 key）
const TIPS_KEY = 'matelog_write_tips_open';
const tipsVisible = ref<string[]>(localStorage.getItem(TIPS_KEY) === '1' ? ['open'] : []);
watch(tipsVisible, (v) => localStorage.setItem(TIPS_KEY, v.includes('open') ? '1' : '0'));

// 对话与质量检查
const messages = ref<{ role: 'user' | 'assistant'; text: string }[]>([]);
const history = ref<{ role: 'user' | 'assistant'; content: string }[]>([]);
const draftInput = ref('');
const pendingQuestions = ref<any[]>([]);
const qaAnswers = ref<Record<number, string>>({});
const assisting = ref(false);
const saving = ref(false);
const resultView = ref<'edit' | 'preview'>('preview');
const result = ref<{
  content: string;
  hours: number | null;
  groups: { name: string; hours: number | null }[];
} | null>(null);

const projectGroups = computed(
  () => projects.value.find((p) => p.id === projectId.value)?.groups || []
);

onMounted(async () => {
  const res = await projectApi.list();
  projects.value = res.data || [];
  await loadTodos();
});

async function loadTodos() {
  try {
    const res = await todoApi.list(logDate);
    todos.value = res.data || [];
  } catch {
    todos.value = [];
  }
}

/** 待办实时保存（整份替换） */
async function persistTodos() {
  try {
    const res = await todoApi.save({
      date: logDate,
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
  if (!projectId.value) {
    ElMessage.warning('请先在上方选择所属项目');
    return;
  }
  messages.value.push({ role: 'user', text: '根据今日待办和执行情况，帮我生成今天的日志。' });
  history.value = [];
  result.value = null;
  runAssist();
}

async function runAssist() {
  assisting.value = true;
  try {
    const res = await logApi.assist({
      date: logDate,
      projectId: projectId.value ?? null,
      todos: todos.value.map((t) => ({ content: t.content, status: t.status })),
      history: history.value,
      provider: 'qwen',
    });
    const data: any = (res as any).data;
    if (data.action === 'done' && data.result) {
      result.value = data.result;
      resultView.value = 'preview';
      pendingQuestions.value = [];
      messages.value.push({
        role: 'assistant',
        text: '✅ 质量检查通过，日志已按「好日志规范」优化生成。\n\n请在右侧检查确认，可直接编辑，确认无误后点击「确认保存日志」。',
      });
      history.value.push({
        role: 'assistant',
        content: '质量检查通过，日志已优化生成，请在右侧确认保存。',
      });
    } else {
      pendingQuestions.value = data.questions || [];
      qaAnswers.value = {};
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
  } finally {
    assisting.value = false;
  }
}

async function submitAnswers() {
  const ansText = pendingQuestions.value
    .map((_q, i) => `${i + 1}. ${qaAnswers.value[i] || '（未回答）'}`)
    .join('\n');
  messages.value.push({ role: 'user', text: '我的回答：\n' + ansText });
  history.value.push({ role: 'user', content: '我的回答：\n' + ansText });
  pendingQuestions.value = [];
  runAssist();
}

async function sendDraft() {
  const d = draftInput.value.trim();
  if (!d) return;
  draftInput.value = '';
  messages.value.push({ role: 'user', text: d });
  history.value.push({ role: 'user', content: '补充说明：' + d });
  runAssist();
}

async function saveLog() {
  if (!result.value?.content) {
    ElMessage.warning('请先生成日志');
    return;
  }
  if (!projectId.value) {
    ElMessage.warning('请选择所属项目');
    return;
  }

  // 原始内容：保留待办执行情况作为原始依据
  const content =
    '今日待办执行情况：' +
    todos.value.map((t) => `${t.status === 'done' ? '[完成]' : '[未完成]'}${t.content}`).join('；');

  // AI 识别的小组名 → 项目小组 id 映射（工时在项目级，由 AI 从补充说明推断，可空）
  const groups = (result.value.groups || [])
    .map((g) => {
      const grp = projectGroups.value.find((pg) => pg.name === g.name);
      return grp ? { groupId: grp.id } : null;
    })
    .filter((x): x is { groupId: number } => !!x);

  saving.value = true;
  try {
    await logApi.save({
      logDate,
      projectId: projectId.value,
      content,
      optimizedContent: result.value.content,
      aiProvider: 'qwen',
      hours: result.value.hours ?? undefined,
      groups,
    });
    ElMessage.success('日志保存成功');
    router.push('/logs');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
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
}

/* 待办 */
.todo-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.todo-list {
  max-height: 460px;
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
  margin-bottom: 10px;
}

/* 填写要点（与旧版一致） */
.write-tips {
  margin-bottom: 12px;
  border: 1px dashed var(--border-color, #dcdfe6);
  border-radius: 8px;
  background: var(--bg-hover, #f8f9fb);
}

.write-tips :deep(.el-collapse-item__header) {
  padding: 0 12px;
  background: transparent;
  height: 36px;
  line-height: 36px;
}

.write-tips :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom: none;
}

.write-tips :deep(.el-collapse-item__content) {
  padding: 0 16px 12px;
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
  color: var(--text-regular, #606266);
  line-height: 1.7;
}

.write-tips-body ol {
  padding-left: 18px;
  margin: 6px 0;
}

.write-tips-body li {
  margin: 3px 0;
}

.write-tips-slogan {
  margin: 0 0 6px;
}

.write-tips-template {
  margin: 8px 0 0;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 对话 */
.chat-card {
  display: flex;
  flex-direction: column;
}

.chat-body {
  flex: 1;
  min-height: 280px;
  max-height: 420px;
  overflow-y: auto;
  padding: 4px;
  margin-bottom: 12px;
}

.chat-msg {
  display: flex;
  margin-bottom: 10px;
}

.chat-msg.user {
  justify-content: flex-end;
}

.chat-msg.assistant {
  justify-content: flex-start;
}

.chat-bubble {
  max-width: 88%;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

.chat-msg.user .chat-bubble {
  background: var(--primary-color, #409eff);
  color: #fff;
  white-space: pre-wrap;
  border-bottom-right-radius: 2px;
}

.chat-msg.assistant .chat-bubble {
  background: var(--el-fill-color-light);
  color: var(--text-primary, #303133);
  border-bottom-left-radius: 2px;
}

/* AI 气泡内的 Markdown 适配 */
.chat-msg.assistant .chat-bubble :deep(.md-preview.markdown-body) {
  font-size: 13px;
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
  flex-wrap: wrap;
  gap: 4px;
}

.chat-input-row {
  display: flex;
  gap: 8px;
}

/* 结果预览 */
.result-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.result-preview {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 6px 14px;
  min-height: 240px;
  max-height: 460px;
  overflow: auto;
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
</style>
