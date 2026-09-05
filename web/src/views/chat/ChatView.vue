<template>
  <div class="chat-page">
    <!-- 桌面端：左侧对话列表 -->
    <div v-if="!isMobile" class="conversation-panel">
      <div class="panel-header">
        <span>对话列表</span>
        <el-button type="primary" size="small" circle @click="newConversation">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>
      <div class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: conv.id === currentConvId }"
          @click="selectConversation(conv.id)"
        >
          <el-icon class="conv-icon"><ChatDotRound /></el-icon>
          <div class="conv-info">
            <div class="conv-title">{{ conv.title }}</div>
            <div class="conv-time">{{ formatTime(conv.updated_at) }}</div>
          </div>
          <el-icon class="conv-delete" @click.stop="deleteConversation(conv)"><Delete /></el-icon>
        </div>
        <el-empty v-if="conversations.length === 0" description="暂无对话" :image-size="60" />
      </div>
    </div>

    <!-- 聊天区 -->
    <div class="chat-main">
      <!-- 移动端顶栏 -->
      <div class="chat-header">
        <el-button v-if="isMobile" link @click="drawerVisible = true">
          <el-icon :size="20"><Menu /></el-icon>
        </el-button>
        <span class="chat-title">
          {{ currentConversation?.title || 'AI 助手' }}
        </span>
        <div class="chat-header-actions">
          <el-select
            v-model="provider"
            size="small"
            style="width: 110px"
            @change="handleProviderChange"
          >
            <el-option label="通义千问" value="qwen" :disabled="!providers.qwenConfigured" />
            <el-option label="DeepSeek" value="deepseek" :disabled="!providers.deepseekConfigured" />
          </el-select>
          <el-button type="primary" size="small" @click="newConversation">
            <el-icon><Plus /></el-icon><span v-if="!isMobile">新对话</span>
          </el-button>
        </div>
      </div>

      <!-- AI 未配置提示 -->
      <el-alert
        v-if="!providers.qwenConfigured && !providers.deepseekConfigured"
        type="warning"
        :closable="false"
        title="AI 未配置"
        description="服务端未配置 AI API Key，请联系管理员在 server/.env 中配置"
        class="config-alert"
      />

      <!-- 消息区 -->
      <div ref="messageListRef" class="message-list" @scroll="handleScroll">
        <div v-if="messages.length === 0" class="empty-chat">
          <el-icon :size="48" color="#dcdfe6"><ChatDotRound /></el-icon>
          <p>你好，我是日志管理 AI 助手</p>
          <p class="empty-tip">
            我可以基于您数据权限范围内的日志回答问题，例如：
          </p>
          <div class="suggestions">
            <el-button
              v-for="s in suggestions"
              :key="s"
              size="small"
              round
              @click="sendMessage(s)"
            >
              {{ s }}
            </el-button>
          </div>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-row"
          :class="msg.role"
        >
          <el-avatar v-if="msg.role === 'user'" :size="32" class="msg-avatar user-avatar">
            {{ userStore.user?.displayName?.charAt(0) }}
          </el-avatar>
          <el-avatar v-else :size="32" class="msg-avatar ai-avatar">AI</el-avatar>
          <div class="chat-bubble" :class="msg.role">{{ msg.content }}</div>
        </div>

        <div v-if="aiThinking" class="message-row assistant">
          <el-avatar :size="32" class="msg-avatar ai-avatar">AI</el-avatar>
          <div class="chat-bubble assistant thinking">
            <el-icon class="is-loading"><Loading /></el-icon>
            AI 思考中...
          </div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="input-area">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="isMobile ? 2 : 3"
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          maxlength="5000"
          @keydown.enter.exact.prevent="handleEnter"
          :disabled="!currentConvId"
        />
        <el-button
          type="primary"
          class="send-btn"
          :loading="aiThinking"
          :disabled="!inputText.trim() || !currentConvId"
          @click="handleSend"
        >
          发送
        </el-button>
      </div>
    </div>

    <!-- 移动端：对话列表抽屉 -->
    <el-drawer v-model="drawerVisible" direction="ltr" :size="260" :with-header="false" :z-index="3000">
      <div class="conversation-panel mobile-panel">
        <div class="panel-header">
          <span>对话列表</span>
          <el-button type="primary" size="small" circle @click="newConversation">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
        <div class="conversation-list">
          <div
            v-for="conv in conversations"
            :key="conv.id"
            class="conversation-item"
            :class="{ active: conv.id === currentConvId }"
            @click="selectConversation(conv.id); drawerVisible = false"
          >
            <el-icon class="conv-icon"><ChatDotRound /></el-icon>
            <div class="conv-info">
              <div class="conv-title">{{ conv.title }}</div>
              <div class="conv-time">{{ formatTime(conv.updated_at) }}</div>
            </div>
            <el-icon class="conv-delete" @click.stop="deleteConversation(conv)"><Delete /></el-icon>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { chatApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import type { Conversation, ChatMessage } from '../../types';

const userStore = useUserStore();
const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

const conversations = ref<Conversation[]>([]);
const currentConvId = ref<number | null>(null);
const currentConversation = computed(() =>
  conversations.value.find((c) => c.id === currentConvId.value)
);
const messages = ref<ChatMessage[]>([]);
const inputText = ref('');
const aiThinking = ref(false);
const drawerVisible = ref(false);
const provider = ref<'qwen' | 'deepseek'>('qwen');
const providers = reactiveProviders();
const messageListRef = ref<HTMLElement>();

const suggestions = [
  '帮我总结本周的工作进展',
  '我这周的工作量如何？',
  '帮我起草一段周报总结',
  '我的日志有哪些可以改进的地方？',
];

function reactiveProviders() {
  return ref({ qwenConfigured: false, deepseekConfigured: false }).value;
}

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
}

let stickToBottom = true;
function handleScroll() {
  const el = messageListRef.value;
  if (!el) return;
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
}

function handleEnter() {
  if (!aiThinking.value) handleSend();
}

async function loadConversations() {
  const res = await chatApi.conversations();
  conversations.value = res.data || [];
  if (conversations.value.length > 0 && !currentConvId.value) {
    await selectConversation(conversations.value[0].id);
  }
}

async function selectConversation(id: number) {
  currentConvId.value = id;
  const res = await chatApi.messages(id);
  messages.value = res.data || [];
  const conv = conversations.value.find((c) => c.id === id);
  if (conv?.provider === 'deepseek' && providers.deepseekConfigured) {
    provider.value = 'deepseek';
  } else if (conv?.provider === 'qwen' && providers.qwenConfigured) {
    provider.value = 'qwen';
  }
  stickToBottom = true;
  scrollToBottom();
}

async function newConversation() {
  const res = await chatApi.createConversation({ provider: provider.value });
  conversations.value.unshift(res.data);
  currentConvId.value = res.data.id;
  messages.value = [];
  drawerVisible.value = false;
}

async function deleteConversation(conv: Conversation) {
  await ElMessageBox.confirm(`确定删除对话「${conv.title}」吗？`, '提示', { type: 'warning' });
  await chatApi.deleteConversation(conv.id);
  conversations.value = conversations.value.filter((c) => c.id !== conv.id);
  if (currentConvId.value === conv.id) {
    currentConvId.value = null;
    messages.value = [];
    if (conversations.value.length > 0) {
      selectConversation(conversations.value[0].id);
    }
  }
}

async function handleSend() {
  if (inputText.value.trim()) {
    await sendMessage(inputText.value.trim());
  }
}

async function sendMessage(text: string) {
  if (!currentConvId.value) {
    await newConversation();
  }
  inputText.value = '';
  // 乐观添加用户消息
  messages.value.push({
    id: Date.now(),
    conversation_id: currentConvId.value!,
    role: 'user',
    content: text,
    created_at: new Date().toISOString(),
  });
  scrollToBottom();

  aiThinking.value = true;
  try {
    await chatApi.send(currentConvId.value!, { content: text, provider: provider.value });
    // 重新拉取消息，保证顺序与内容准确
    const res = await chatApi.messages(currentConvId.value!);
    messages.value = res.data || [];
    // 刷新对话列表（标题可能更新）
    const convRes = await chatApi.conversations();
    conversations.value = convRes.data || [];
    if (stickToBottom) scrollToBottom();
  } finally {
    aiThinking.value = false;
  }
}

function handleProviderChange(val: string) {
  provider.value = val as 'qwen' | 'deepseek';
}

onMounted(async () => {
  try {
    const res = await chatApi.providers();
    providers.qwenConfigured = res.data.qwenConfigured;
    providers.deepseekConfigured = res.data.deepseekConfigured;
    if (!providers.qwenConfigured && providers.deepseekConfigured) {
      provider.value = 'deepseek';
    }
  } catch {
    // ignore
  }
  await loadConversations();
});
</script>

<style scoped>
.chat-page {
  display: flex;
  height: calc(100vh - 56px);
}

/* 对话列表面板 */
.conversation-panel {
  width: 240px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.mobile-panel {
  width: 100%;
  border-right: none;
}

.panel-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-weight: 600;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
}

.conversation-item:hover {
  background: #f5f7fa;
}

.conversation-item.active {
  background: #ecf5ff;
}

.conv-icon {
  color: #909399;
  flex-shrink: 0;
}

.conv-info {
  flex: 1;
  min-width: 0;
}

.conv-title {
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 2px;
}

.conv-delete {
  color: #c0c4cc;
  flex-shrink: 0;
  visibility: hidden;
}

.conversation-item:hover .conv-delete {
  visibility: visible;
}

.conv-delete:hover {
  color: #f56c6c;
}

/* 聊天主区 */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f5f7fa;
}

.chat-header {
  height: 52px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  flex-shrink: 0;
}

.chat-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-alert {
  border-radius: 0;
}

/* 消息区 */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #909399;
}

.empty-chat p {
  font-size: 14px;
}

.empty-tip {
  font-size: 12px !important;
  color: #c0c4cc;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 480px;
}

.message-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.message-row.user {
  flex-direction: row-reverse;
}

.message-row.user .chat-bubble {
  margin-left: auto;
}

.msg-avatar {
  flex-shrink: 0;
  font-size: 14px;
}

.user-avatar {
  background: #409eff;
  color: #fff;
}

.ai-avatar {
  background: #67c23a;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.chat-bubble.thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #909399;
}

/* 输入区 */
.input-area {
  background: #fff;
  border-top: 1px solid #e4e7ed;
  padding: 12px;
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-shrink: 0;
}

.send-btn {
  height: 40px;
  padding: 0 20px;
  flex-shrink: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .chat-page {
    height: calc(100vh - 56px);
  }

  .message-row.user .chat-bubble {
    margin-left: 0;
  }
}
</style>
