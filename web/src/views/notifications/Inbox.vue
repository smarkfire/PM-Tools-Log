<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">收件箱</div>
      <div class="page-desc">版本发布、审批结果、反馈回复等站内消息</div>
    </div>

    <el-card shadow="never" v-loading="loading">
      <template #header>
        <div class="inbox-header">
          <span>未读 <el-badge :value="unread" :hidden="unread === 0" type="danger" /></span>
          <el-button size="small" :disabled="unread === 0" @click="markAllRead">全部已读</el-button>
        </div>
      </template>

      <div v-if="!isMobile" class="notice-list">
        <div
          v-for="n in notifications"
          :key="n.id"
          class="notice-item"
          :class="{ unread: !n.is_read }"
          @click="openNotice(n)"
        >
          <div class="notice-icon">
            <el-icon :size="20" :color="iconColor(n.type)">
              <Bell v-if="n.type === 'approval'" />
              <Promotion v-else-if="n.type === 'version'" />
              <ChatDotRound v-else />
            </el-icon>
          </div>
          <div class="notice-main">
            <div class="notice-title">
              <span>{{ n.title }}</span>
              <el-tag v-if="!n.is_read" size="small" type="danger">未读</el-tag>
            </div>
            <div class="notice-content">{{ previewText(n.content) }}</div>
            <div class="notice-time">{{ formatTime(n.created_at) }}</div>
          </div>
        </div>
        <el-empty v-if="!loading && notifications.length === 0" description="暂无消息" />
      </div>

      <!-- 移动端 -->
      <div v-else class="mobile-notice-list">
        <div
          v-for="n in notifications"
          :key="n.id"
          class="notice-item"
          :class="{ unread: !n.is_read }"
          @click="openNotice(n)"
        >
          <div class="notice-title">
            <span>{{ n.title }}</span>
            <el-tag v-if="!n.is_read" size="small" type="danger">未读</el-tag>
          </div>
          <div class="notice-content">{{ previewText(n.content) }}</div>
          <div class="notice-time">{{ formatTime(n.created_at) }}</div>
        </div>
        <el-empty v-if="!loading && notifications.length === 0" description="暂无消息" />
      </div>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 消息详情 -->
    <el-dialog v-model="detailVisible" :title="current?.title" :width="isMobile ? '92%' : '520px'">
      <div class="detail-time">{{ current ? formatTime(current.created_at) : '' }}</div>
      <div class="detail-body">
        <MdPreview :content="current?.content" />
      </div>
      <template #footer>
        <el-button v-if="current?.link" type="primary" @click="goLink(current)">前往查看</el-button>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { notificationApi, type Notification } from '../../api';
import { useAppStore } from '../../stores/app';
import MdPreview from '../../components/MdPreview.vue';

const router = useRouter();
const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

const notifications = ref<Notification[]>([]);
const unread = ref(0);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);

const detailVisible = ref(false);
const current = ref<Notification | null>(null);

function previewText(text: string) {
  const plain = text.replace(/\n+/g, ' ');
  return plain.length > 80 ? plain.slice(0, 80) + '...' : plain;
}

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

function iconColor(type: string) {
  if (type === 'approval') return '#e6a23c';
  if (type === 'version') return '#67c23a';
  return '#409eff';
}

async function loadData() {
  loading.value = true;
  try {
    const res = await notificationApi.list({ page: page.value, pageSize });
    notifications.value = res.data.list || [];
    total.value = res.data.total || 0;
    const cnt = await notificationApi.unreadCount();
    unread.value = cnt.data.count || 0;
  } finally {
    loading.value = false;
  }
}

async function openNotice(n: Notification) {
  current.value = n;
  detailVisible.value = true;
  if (!n.is_read) {
    await notificationApi.markRead(n.id);
    n.is_read = true;
    unread.value = Math.max(0, unread.value - 1);
  }
}

async function markAllRead() {
  await notificationApi.markAllRead();
  ElMessage.success('已全部标记为已读');
  loadData();
}

function goLink(n: Notification) {
  if (n.link) {
    detailVisible.value = false;
    router.push(n.link);
  }
}

onMounted(loadData);
</script>

<style scoped>
.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.notice-list,
.mobile-notice-list {
  display: flex;
  flex-direction: column;
}

.notice-item {
  display: flex;
  gap: 12px;
  padding: 13px 12px;
  border-bottom: 1px solid var(--border-lighter);
  border-radius: var(--radius-lg);
  cursor: pointer;
  align-items: flex-start;
  transition: background var(--transition-fast);
}

.notice-item:hover {
  background: var(--fill-light);
}

.notice-item.unread {
  background: #f0f7ff;
}

.notice-item.unread:hover {
  background: #e6f0fc;
}

.notice-item.unread .notice-title span {
  font-weight: 600;
}

.notice-icon {
  margin-top: 2px;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fill-light);
  flex-shrink: 0;
}

.notice-main {
  flex: 1;
  min-width: 0;
}

.notice-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-primary);
}

.notice-content {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.notice-time {
  font-size: 12px;
  color: var(--text-placeholder);
  margin-top: 4px;
}

.detail-time {
  font-size: 12px;
  color: var(--text-placeholder);
  margin-bottom: 10px;
}

.detail-body {
  border: 1px solid var(--border-lighter);
  border-radius: var(--radius-lg);
  padding: 14px;
  background: #fafbfc;
}
</style>
