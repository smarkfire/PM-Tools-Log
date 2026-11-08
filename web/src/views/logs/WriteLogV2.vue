<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-left">
        <div class="page-title">
          填写日志Agent
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

    <el-row :gutter="16" class="fill-row">
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
              type="textarea"
              :rows="2"
              :autosize="{ minRows: 2, maxRows: 6 }"
              placeholder="添加一条待办：Enter 保存，Shift+Enter 换行，可输入长文本"
              @keydown.enter="handleTodoEnter"
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

      <!-- 右：日志填写Agent 对话（主区） -->
      <el-col :xs="24" :md="17">
        <el-card shadow="never" class="block-card chat-card">
          <template #header>
            <div class="card-head-row">
              <span class="card-title">日志填写Agent</span>
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
                  <div v-if="m.logResult.projects && m.logResult.projects.length" class="group-note">
                    识别项目：{{ m.logResult.projects.join('、') }}
                  </div>
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
                    <el-icon><Check /></el-icon>质检并保存
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

                <!-- 项目：从参与的项目中选择（单选） -->
                <el-select
                  v-if="q.field === 'project'"
                  v-model="qaAnswers[qi].choice"
                  filterable
                  clearable
                  placeholder="请选择项目"
                  style="width: 100%"
                >
                  <el-option v-for="name in myProjectNames" :key="name" :label="name" :value="name" />
                </el-select>

                <!-- 小组：随所选项目联动（单选）；未选项目时展示全部参与小组 -->
                <el-select
                  v-else-if="q.field === 'group'"
                  v-model="qaAnswers[qi].choice"
                  filterable
                  clearable
                  :placeholder="qaGroupOptions.length ? '请选择小组' : '暂无可选小组'"
                  style="width: 100%"
                >
                  <el-option v-for="name in qaGroupOptions" :key="name" :label="name" :value="name" />
                </el-select>

                <!-- 工时：数字控件 -->
                <el-input-number
                  v-else-if="q.field === 'hours'"
                  v-model="qaAnswers[qi].number"
                  :min="0"
                  :max="24"
                  :step="0.5"
                  :precision="1"
                  style="width: 100%"
                />

                <template v-else-if="q.options && q.options.length">
                  <el-radio-group v-model="qaAnswers[qi].choice" class="qa-options">
                    <el-radio v-for="opt in q.options" :key="opt" :value="opt">{{ opt }}</el-radio>
                    <el-radio value="__other__">其他（自行填写）</el-radio>
                  </el-radio-group>
                  <el-input
                    v-if="qaAnswers[qi].choice === '__other__'"
                    v-model="qaAnswers[qi].other"
                    type="textarea"
                    :rows="2"
                    placeholder="请输入其他内容"
                    style="margin-top: 6px"
                  />
                </template>

                <!-- 自由回答：多行文本输入 -->
                <el-input
                  v-else
                  v-model="qaAnswers[qi].choice"
                  type="textarea"
                  :rows="3"
                  placeholder="请输入你的回答（可多行详细描述）"
                />
              </div>
              <el-button type="primary" size="small" :loading="assisting" @click="submitAnswers">
                提交回答
              </el-button>
            </div>
          </div>

          <div class="chat-input-area">
            <div class="input-card" :class="{ focused: inputFocused }">
              <el-input
                v-model="draftInput"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 10 }"
                placeholder="补充说明：今天具体做了什么、有什么成果…也可以直接向 AI 提问"
                @focus="inputFocused = true"
                @blur="inputFocused = false"
                @keydown.enter.exact.prevent="sendDraft"
              />
              <div class="input-footer">
                <span class="input-hint">Enter 发送 · Shift+Enter 换行</span>
                <el-button
                  type="primary"
                  class="send-btn"
                  :loading="assisting"
                  :disabled="!draftInput.trim()"
                  @click="sendDraft"
                >
                  <el-icon><Promotion /></el-icon>发送
                </el-button>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 保存前二次质检：展示分数与修改建议，确认保存或返回修改 -->
    <el-dialog
      v-model="reviewVisible"
      title="保存前二次质检"
      width="min(92vw, 520px)"
      top="8vh"
      :close-on-click-modal="false"
    >
      <div v-if="!reviewResult" class="review-loading">
        <el-icon class="review-spin"><Loading /></el-icon>
        <div class="review-loading-text">
          <div class="review-loading-title">AI 正在复检日志…</div>
          <div class="review-loading-step">{{ reviewStep }}</div>
        </div>
      </div>
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
        <el-button @click="cancelReview">返回修改</el-button>
        <el-button type="success" :loading="saving" :disabled="!reviewResult" @click="doSave">
          <el-icon><Check /></el-icon>确认保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { chatApi, logApi, projectApi, todoApi, type TodoItem } from '../../api';
import { currentWeekMonday } from '../../utils/date';
import MdPreview from '../../components/MdPreview.vue';

const router = useRouter();

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
  projects?: string[];
  content: string;
  hours: number | null;
  score?: number | null;
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
const inputFocused = ref(false);
const pendingQuestions = ref<any[]>([]);
/** 问答答案：multi 用于项目/小组多选，number 用于工时，choice/other 用于选项与自由输入 */
const qaAnswers = ref<Record<number, { choice: string; other: string; multi: string[]; number: number | null }>>({});

// 过滤 AI 自带的"其他/自行填写"类兜底选项，避免与前端固定的自由填写入口重复
function filterOtherOptions(questions: any[] | undefined): any[] {
  return (questions || []).map((q) => ({
    ...q,
    options: (q.options || []).filter(
      (o: string) => !/其他|自行填写|自己填|以上都|自由输入/.test(o)
    ),
  }));
}
const assisting = ref(false);
const saving = ref(false);
const chatBodyEl = ref<HTMLElement | null>(null);

// 当前最新的日志优化稿（供保存使用；与对话消息内卡片同一引用）
const result = ref<AssistResult | null>(null);

// 质检问答的下拉候选：我参与的项目与小组（与项目管理数据一致，避免填写错误）
const myProjectOptions = ref<{ name: string; groups: string[] }[]>([]);
const myProjectNames = computed(() => myProjectOptions.value.map((p) => p.name));
const myGroupNames = computed(() => [...new Set(myProjectOptions.value.flatMap((p) => p.groups))]);

/** 问答中已选择的所属项目（用于小组下拉联动） */
const qaProjectAnswer = computed(() => {
  const idx = pendingQuestions.value.findIndex((q: any) => q.field === 'project');
  return idx >= 0 ? qaAnswers.value[idx]?.choice || '' : '';
});

/** 小组候选：随所选项目联动；未选项目时展示全部参与小组 */
const qaGroupOptions = computed(() => {
  if (!qaProjectAnswer.value) return myGroupNames.value;
  return myProjectOptions.value.find((p) => p.name === qaProjectAnswer.value)?.groups || [];
});

onMounted(async () => {
  const [providerRes, todoRes, projectRes] = await Promise.all([
    chatApi.providers().catch(() => null),
    todoApi.list(logDate.value).catch(() => null),
    projectApi.list().catch(() => null),
  ]);
  if (providerRes) {
    providers.qwenConfigured = providerRes.data.qwenConfigured;
    providers.deepseekConfigured = providerRes.data.deepseekConfigured;
    if (!providers.qwenConfigured && providers.deepseekConfigured) provider.value = 'deepseek';
  }
  todos.value = todoRes?.data || [];
  // 质检问答项目/小组下拉候选：与项目管理数据保持一致
  if (projectRes) {
    myProjectOptions.value = (projectRes.data || []).map((p) => ({
      name: p.name,
      groups: (p.groups || []).map((g) => g.name),
    }));
  }
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

/** 待办输入框回车：Enter 保存，Shift+Enter 换行 */
function handleTodoEnter(e: KeyboardEvent) {
  if (e.shiftKey) return;
  e.preventDefault();
  addTodo();
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
      result.value = { ...data.result, score: data.score };
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
      pendingQuestions.value = filterOtherOptions(data.questions);
      qaAnswers.value = {};
      pendingQuestions.value.forEach((q: any, i: number) => {
        // 按题型初始化答案容器（项目/小组多选、工时数字、其余文本）
        qaAnswers.value[i] = { choice: '', other: '', multi: [], number: 8 };
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
  // 组装各题答案：项目/小组取单选、工时取数字，其余取选项或自由输入
  const answers = pendingQuestions.value.map((q: any, i: number) => {
    const a =
      qaAnswers.value[i] || { choice: '', other: '', multi: [] as string[], number: null as number | null };
    let answer: string;
    if (q.field === 'project' || q.field === 'group') {
      answer = a.choice;
    } else if (q.field === 'hours') {
      answer = a.number != null ? `${a.number} 小时` : '';
    } else if (a.choice === '__other__') {
      answer = a.other;
    } else {
      answer = a.choice;
    }
    return { idx: i + 1, answer: answer.trim() };
  });
  const missing = answers.filter((x) => !x.answer);
  if (missing.length) {
    ElMessage.warning(`第 ${missing.map((x) => x.idx).join('、')} 题还未作答，请补充后再提交`);
    return;
  }
  const ansText = answers.map((x) => `${x.idx}. ${x.answer}`).join('\n');
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

async function saveLog() {
  if (!result.value?.content) {
    ElMessage.warning('请先生成日志');
    return;
  }
  if (reviewing.value) return;
  // 保存前先做二次质检，弹窗展示分数与修改建议，由用户决定确认保存或返回修改
  reviewing.value = true;
  reviewResult.value = null;
  reviewVisible.value = true;
  startReviewSteps();
  try {
    const res = await logApi.review({
      date: logDate.value,
      content: result.value.content,
      provider: provider.value,
    });
    reviewResult.value = res.data;
    stopReviewSteps();
  } catch (e: any) {
    stopReviewSteps();
    reviewVisible.value = false;
    const msg = e?.response?.data?.message || e?.message || '网络异常';
    try {
      await ElMessageBox.confirm(`二次质检失败（${msg}），是否跳过质检直接保存？`, '提示', {
        type: 'warning',
        confirmButtonText: '直接保存',
        cancelButtonText: '取消',
      });
      await doSave();
    } catch {
      // 用户取消
    }
  } finally {
    reviewing.value = false;
  }
}

// ==================== 保存前二次质检 ====================
interface ReviewResult {
  score: number | null;
  summary: string;
  suggestions: string[];
}
const reviewVisible = ref(false);
const reviewing = ref(false);
const reviewResult = ref<ReviewResult | null>(null);

/** 得分配色：≥80 绿 / ≥60 橙 / <60 红 */
function scoreClass(s: number | null | undefined) {
  if (s == null) return 'score-none';
  if (s >= 80) return 'score-high';
  if (s >= 60) return 'score-mid';
  return 'score-low';
}

// 复检动作提示：轮换展示当前正在做的步骤
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

/** 复检中点击"返回修改"：关闭弹窗并复位状态 */
function cancelReview() {
  reviewVisible.value = false;
  reviewing.value = false;
  stopReviewSteps();
}

onUnmounted(stopReviewSteps);

async function doSave() {
  // 原始内容：保留待办执行情况作为原始依据
  const content =
    '今日待办执行情况：' +
    todos.value.map((t) => `${t.status === 'done' ? '[完成]' : '[未完成]'}${t.content}`).join('；');

  saving.value = true;
  try {
    await logApi.save({
      logDate: logDate.value,
      projectId: null,
      content,
      optimizedContent: result.value!.content,
      aiProvider: provider.value,
      hours: result.value!.hours ?? undefined,
      source: 'v2',
      // 保存进日志表的分数以保存前二次质检为准
      aiScore: reviewResult.value?.score ?? result.value?.score ?? undefined,
    });
    ElMessage.success('日志保存成功');
    reviewVisible.value = false;
    router.push('/logs/v2');
  } catch (e: any) {
    ElMessage.error('保存失败：' + (e?.response?.data?.message || e?.message || '网络异常'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
/* 整页锁定视口：页面不滚动，滚动收进控件内部 */
.page-container {
  height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.header-left {
  flex-shrink: 0;
}

/* 行内两列拉满剩余高度 */
.fill-row {
  flex: 1;
  min-height: 0;
}

.fill-row > .el-col {
  height: 100%;
}

.block-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.block-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.header-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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

:global(.tips-popover-popper .tips-popover::-webkit-scrollbar) {
  width: 6px;
}

:global(.tips-popover-popper .tips-popover::-webkit-scrollbar-thumb) {
  background: #d4d7de;
  border-radius: 3px;
}

:global(.tips-popover-popper .tips-popover::-webkit-scrollbar-track) {
  background: transparent;
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

.card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* 待办 */
.todo-input-row {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}

.todo-input-row .el-button {
  margin-top: 4px;
}

.todo-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  margin-bottom: 6px;
}

/* 长待办文本换行展示 */
.todo-item .el-checkbox {
  height: auto;
}

.todo-item .todo-content {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  word-break: break-word;
  white-space: pre-wrap;
  line-height: 1.5;
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

/* 对话区（AI 助手风格）：卡片 body 内 flex 自适应 */
.chat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 10px;
  margin-bottom: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-blank, #fff);
  scrollbar-width: thin;
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

/* 输入区（卡片式，聚焦高亮） */
.chat-input-area {
  flex-shrink: 0;
  margin-top: 4px;
}

.input-card {
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 12px;
  padding: 8px 12px 6px;
  background: var(--el-bg-color, #fff);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-card.focused {
  border-color: var(--primary-color, #409eff);
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}

.input-card :deep(.el-textarea__inner) {
  border: none;
  box-shadow: none;
  padding: 6px 4px;
  font-size: 14px;
  line-height: 1.65;
  background: transparent;
  resize: none;
}

.input-card :deep(.el-textarea__inner::placeholder) {
  color: var(--text-placeholder, #a8abb2);
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.input-hint {
  font-size: 12px;
  color: var(--text-placeholder, #a8abb2);
}

.send-btn {
  border-radius: 18px;
  padding: 0 20px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.send-btn .el-icon {
  margin-right: 0;
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
  /* 移动端放开页面滚动，控件保持内部滚动 */
  .page-container {
    height: auto;
    overflow: visible;
  }

  .fill-row > .el-col {
    height: auto;
  }

  .block-card {
    height: auto;
  }

  .block-card :deep(.el-card__body) {
    overflow: visible;
  }

  .chat-body {
    min-height: 320px;
    max-height: 60vh;
  }

  .todo-list {
    max-height: 300px;
  }
}

/* ==================== 保存前二次质检弹窗 ==================== */
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
  color: var(--text-regular, #606266);
}

.review-summary {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-regular, #606266);
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 8px;
  padding: 10px 12px;
}

.review-sug-title {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
}

.review-sug-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-regular, #606266);
}
</style>
