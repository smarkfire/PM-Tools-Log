<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">填写日志 · 新版</div>
      <div class="page-desc">
        对照今日待办，和 AI 对话生成符合规范的日志；信息缺失时 AI 会提问，补全后再优化输出
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 左：今日待办 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="block-card">
          <template #header><span class="card-title">今日待办</span></template>

          <el-form label-position="top">
            <el-form-item label="日志日期">
              <el-date-picker
                v-model="form.logDate"
                type="date"
                value-format="YYYY-MM-DD"
                :disabled-date="disableOutOfRangeDate"
                style="width: 100%"
                @change="onDateChange"
              />
            </el-form-item>
            <el-form-item label="所属项目" required>
              <el-select v-model="form.projectId" placeholder="请选择项目（必填）" style="width: 100%">
                <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="当天总工时（小时）">
              <el-input-number v-model="form.hours" :min="0" :max="24" :step="0.5" style="width: 100%" />
            </el-form-item>
          </el-form>

          <div class="todo-input-row">
            <el-input v-model="newTodoText" placeholder="添加一条待办，回车确认" @keyup.enter="addTodo" />
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
          <el-empty v-else description="暂无待办" :image-size="50" />

          <div class="todo-actions">
            <el-button :loading="savingTodo" @click="saveTodos">保存待办</el-button>
            <el-button
              type="primary"
              :loading="assisting"
              :disabled="!form.projectId"
              @click="startGenerate"
            >
              <el-icon><MagicStick /></el-icon>根据待办生成日志
            </el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 中：对话与质量检查 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="block-card chat-card">
          <template #header>
            <div class="card-head-row">
              <span class="card-title">对话与质量检查</span>
              <el-tag v-if="assisting" size="small" type="warning">AI 处理中</el-tag>
            </div>
          </template>

          <div class="chat-body">
            <div v-for="(m, i) in messages" :key="i" class="chat-msg" :class="m.role">
              <div class="chat-bubble">{{ m.text }}</div>
            </div>

            <el-empty v-if="!messages.length" description="点击左侧「根据待办生成日志」开始对话" :image-size="60" />

            <!-- 待回答的质量检查问题 -->
            <div v-if="pendingQuestions.length" class="qa-panel">
              <div class="qa-title">请补充以下信息：</div>
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
              placeholder="补充说明（可选），如：今天主要是和测试联调接口"
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
              <el-tag v-if="result" size="small" type="success">已生成</el-tag>
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

            <div v-if="result.groups && result.groups.length" class="group-hours-note">
              识别到的小组工时：{{ result.groups.map((g) => `${g.name} ${g.hours ?? 0}h`).join('、') }}
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
          <el-empty v-else description="生成日志后在此预览" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { logApi, projectApi, todoApi, type TodoItem } from '../../api';
import { useUserStore } from '../../stores/user';
import { currentWeekMonday, formatDate } from '../../utils/date';
import MdPreview from '../../components/MdPreview.vue';
import type { Project } from '../../types';

const router = useRouter();
const userStore = useUserStore();

const projects = ref<Project[]>([]);
const todos = ref<TodoItem[]>([]);
const newTodoText = ref('');

const today = formatDate(new Date());
const form = reactive({
  logDate: today,
  projectId: undefined as number | undefined,
  hours: 8,
});

// 可填日期范围：本周一 ~ 本周日
const weekMonday = currentWeekMonday();
const mondayTime = new Date(weekMonday + 'T00:00:00').getTime();
const sundayTime = mondayTime + 6 * 24 * 3600 * 1000;
function disableOutOfRangeDate(d: Date): boolean {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return t < mondayTime || t > sundayTime;
}

// 对话与质量检查
const messages = ref<{ role: 'user' | 'assistant'; text: string }[]>([]);
const history = ref<{ role: 'user' | 'assistant'; content: string }[]>([]);
const draftInput = ref('');
const pendingQuestions = ref<any[]>([]);
const qaAnswers = ref<Record<number, string>>({});
const assisting = ref(false);
const saving = ref(false);
const savingTodo = ref(false);
const resultView = ref<'edit' | 'preview'>('preview');
const result = ref<{ content: string; hours: number | null; groups: { name: string; hours: number | null }[] } | null>(null);

const projectGroups = computed(() => projects.value.find((p) => p.id === form.projectId)?.groups || []);

onMounted(async () => {
  const res = await projectApi.list();
  projects.value = res.data || [];
  await loadTodos();
});

async function onDateChange() {
  result.value = null;
  pendingQuestions.value = [];
  messages.value = [];
  history.value = [];
  await loadTodos();
}

async function loadTodos() {
  try {
    const res = await todoApi.list(form.logDate);
    todos.value = res.data || [];
  } catch {
    todos.value = [];
  }
}

function addTodo() {
  const c = newTodoText.value.trim();
  if (!c) return;
  todos.value.push({ id: 0, content: c, status: 'pending', sort_order: todos.value.length });
  newTodoText.value = '';
}

function removeTodo(i: number) {
  todos.value.splice(i, 1);
}

function toggleTodo(i: number, val: boolean) {
  todos.value[i].status = val ? 'done' : 'pending';
}

async function saveTodos() {
  savingTodo.value = true;
  try {
    const res = await todoApi.save({
      date: form.logDate,
      items: todos.value.map((t) => ({ content: t.content, status: t.status })),
    });
    todos.value = res.data || [];
    ElMessage.success('待办已保存');
  } finally {
    savingTodo.value = false;
  }
}

function startGenerate() {
  if (!form.projectId) {
    ElMessage.warning('请先选择所属项目');
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
      date: form.logDate,
      projectId: form.projectId ?? null,
      todos: todos.value.map((t) => ({ content: t.content, status: t.status })),
      history: history.value,
      provider: 'qwen',
    });
    const data: any = (res as any).data;
    if (data.action === 'done' && data.result) {
      result.value = data.result;
      pendingQuestions.value = [];
      if (data.result.hours != null) form.hours = data.result.hours;
      messages.value.push({ role: 'assistant', text: '日志已生成，请在右侧检查确认。' });
    } else {
      pendingQuestions.value = data.questions || [];
      qaAnswers.value = {};
      const qtext = pendingQuestions.value
        .map(
          (q: any, i: number) =>
            `${i + 1}. ${q.question}${q.options?.length ? `（选项：${q.options.join(' / ')}）` : ''}`
        )
        .join('\n');
      history.value.push({ role: 'assistant', content: '请补充以下信息：\n' + qtext });
      messages.value.push({ role: 'assistant', text: '我需要确认以下几点：\n' + qtext });
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
  if (!form.projectId) {
    ElMessage.warning('请选择所属项目');
    return;
  }
  // 原始内容：保留待办执行情况作为原始依据
  const rawParts = ['今日待办执行情况：' + todos.value
    .map((t) => `${t.status === 'done' ? '[完成]' : '[未完成]'}${t.content}`)
    .join('；')];
  const content = rawParts.join('\n');

  // AI 识别的小组名 → 项目小组 id 映射
  const groups = (result.value.groups || [])
    .map((g) => {
      const grp = projectGroups.value.find((pg) => pg.name === g.name);
      return grp ? { groupId: grp.id, hours: g.hours ?? null } : null;
    })
    .filter((x): x is { groupId: number; hours: number | null } => !!x);

  saving.value = true;
  try {
    await logApi.save({
      logDate: form.logDate,
      projectId: form.projectId,
      content,
      optimizedContent: result.value.content,
      aiProvider: 'qwen',
      hours: form.hours,
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
}

/* 待办 */
.todo-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.todo-list {
  max-height: 320px;
  overflow-y: auto;
  margin-bottom: 12px;
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

.todo-actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
}

/* 对话 */
.chat-card {
  display: flex;
  flex-direction: column;
}

.chat-body {
  flex: 1;
  min-height: 320px;
  max-height: 480px;
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
  max-width: 85%;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.chat-msg.user .chat-bubble {
  background: var(--primary-color, #409eff);
  color: #fff;
  border-bottom-right-radius: 2px;
}

.chat-msg.assistant .chat-bubble {
  background: var(--el-fill-color-light);
  color: var(--text-primary, #303133);
  border-bottom-left-radius: 2px;
}

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

.group-hours-note {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary, #909399);
}
</style>