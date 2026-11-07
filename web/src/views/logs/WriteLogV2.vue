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
                标准：别人不看代码、不开会，也能知道你这天<strong>干了什么、干到什么程度、明天从哪继续</strong>。AI 按此规范检查并打分（满分 100），<strong>达到 80 分</strong>才能生成定稿。
              </p>
              <p class="tips-structure-title">标准日志模板（Markdown 层级）：</p>
              <pre class="tips-template"># 张三 2026-11-07 的日志
## {项目名称}
- 投入时长：X小时
### {小组名称}
- {做了什么，有什么成果}
## 明日计划
- {后续工作安排}
## 问题与风险
- {卡点或需要的协助}</pre>
              <ol>
                <li><strong>一级标题</strong>：谁的哪天的日志</li>
                <li><strong>二级标题</strong>：项目名称（下写当天总投入时长）、明日计划、问题与风险</li>
                <li><strong>三级标题</strong>：小组名称，组下逐条写事项</li>
                <li><strong>每条事项</strong>：写清"做了什么、有什么成果"，对象融进句子（模块、页面、接口、文档、Bug 号），带进展状态，尽量量化</li>
              </ol>
              <p class="tips-structure-title">事项怎么写算好？公式：进展 + 对象 + 动作 + 成果：</p>
              <table class="tips-table">
                <tr><th>差的表述</th><th>好的表述</th></tr>
                <tr><td>处理了一些需求</td><td>完成用户管理页权限校验开发，提测通过</td></tr>
                <tr><td>修 Bug</td><td>修复登录 token 过期闪退问题（BUG-128），已上线</td></tr>
                <tr><td>继续做</td><td>智能体问答功能开发（进度 80%），剩余评测模块</td></tr>
              </table>
              <p class="tips-score">
                评分构成：事项具体性 30 分 / 成果量化 20 分 / 工时明确 20 分 / 明日计划 15 分 / 问题与风险 15 分；一条一件事，写结果不写过程
              </p>
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
                <div v-if="m.think" class="think-block" :class="{ streaming: m.streaming }">
                  <div class="think-label">🤔 AI 思考过程</div>
                  <div class="think-text">{{ m.think }}<span v-if="m.streaming" class="think-cursor"></span></div>
                </div>
                <MdPreview v-if="m.role === 'assistant' && m.text" :content="m.text" />
                <template v-else-if="m.role === 'user'">{{ m.text }}</template>

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
  think?: string;
  streaming?: boolean;
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
  const hasTodos = todos.value.length > 0;
  messages.value.push({
    role: 'user',
    text: hasTodos
      ? '根据今日待办和执行情况，帮我生成今天的日志。'
      : '今天没有填写待办，请按标准日志模板帮我起草今天的日志。',
  });
  history.value = [];
  result.value = null;
  pendingQuestions.value = [];
  runAssist();
}

async function runAssist() {
  assisting.value = true;
  // AI 回复消息：思考过程流式追加，最终结果到达后填充正文（reactive 保证流式更新生效）
  const msg = reactive<ChatMsg>({ role: 'assistant', text: '', think: '', streaming: true });
  messages.value.push(msg);

  let finalData: any = null;
  let errMsg = '';
  try {
    await logApi.assistStream(
      {
        date: logDate.value,
        projectId: null,
        todos: todos.value.map((t) => ({ content: t.content, status: t.status })),
        history: history.value,
        provider: provider.value,
      },
      {
        onThink: (t) => {
          msg.think = (msg.think || '') + t;
          scrollChat();
        },
        onFinal: (d) => {
          finalData = d;
        },
        onError: (m) => {
          errMsg = m;
        },
      }
    );
    msg.streaming = false;

    if (errMsg) {
      msg.text = '⚠️ 生成失败：' + errMsg + '\n\n请检查模型配置后重试。';
      ElMessage.error('生成失败：' + errMsg);
      return;
    }

    const data = finalData;
    if (data && data.action === 'done' && data.result) {
      result.value = data.result;
      pendingQuestions.value = [];
      msg.text =
        `✅ 质量检查通过${data.score != null ? `（${data.score} 分）` : ''}：${data.summary || '日志已按「好日志规范」优化生成'}\n\n` +
        '请在下方卡片中检查确认，可直接编辑，确认无误后点击「确认保存日志」。';
      msg.logResult = data.result;
      msg.viewMode = 'preview';
      history.value.push({
        role: 'assistant',
        content: `质量检查通过${data.score != null ? `（${data.score}分）` : ''}，日志已优化生成。`,
      });
    } else if (data) {
      pendingQuestions.value = data.questions || [];
      qaAnswers.value = {};
      pendingQuestions.value.forEach((_q, i) => {
        qaAnswers.value[i] = { choice: '', other: '' };
      });
      msg.text =
        `🔍 质量检查${data.score != null ? `：${data.score} 分，未达到 80 分` : ''}\n\n${data.summary || ''}\n\n` +
        '请在下方回答补充问题（可选选项或自行填写），提交后 AI 将重新生成并再次检查。';
      history.value.push({
        role: 'assistant',
        content:
          `质量检查${data.score != null ? data.score + '分' : ''}：${data.summary || ''}。需要用户补充：` +
          pendingQuestions.value.map((q: any, i: number) => `${i + 1}.${q.question}`).join('；'),
      });
    }
    scrollChat();
  } catch (e: any) {
    msg.streaming = false;
    const em = e?.message || '网络异常';
    msg.text = '⚠️ 生成失败：' + em + '\n\n请检查模型配置后重试。';
    ElMessage.error('生成失败：' + em);
  } finally {
    assisting.value = false;
  }
}

/** 聊天区滚动到底部 */
async function scrollChat() {
  await nextTick();
  chatBodyEl.value?.scrollTo({ top: chatBodyEl.value.scrollHeight, behavior: 'smooth' });
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

.tips-structure-title {
  margin: 0 0 4px;
  font-weight: 600;
}

.tips-score {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

.tips-table {
  width: 100%;
  border-collapse: collapse;
  margin: 6px 0 0;
  font-size: 12px;
}

.tips-table th,
.tips-table td {
  border: 1px solid var(--el-border-color-lighter);
  padding: 4px 6px;
  text-align: left;
  word-break: break-all;
}

.tips-table th {
  background: var(--el-fill-color-light);
  color: var(--text-secondary, #909399);
  font-weight: 600;
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

/* AI 思考过程块（流式输出） */
.think-block {
  background: rgba(0, 0, 0, 0.035);
  border-left: 3px solid #c0c4cc;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 12.5px;
  color: var(--text-secondary, #909399);
  max-height: 200px;
  overflow-y: auto;
}

.think-label {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--text-regular, #a8abb2);
}

.think-text {
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
}

.think-cursor {
  display: inline-block;
  width: 7px;
  height: 13px;
  background: var(--primary-color, #409eff);
  margin-left: 2px;
  vertical-align: -2px;
  animation: think-blink 1s infinite;
}

@keyframes think-blink {
  50% {
    opacity: 0;
  }
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
