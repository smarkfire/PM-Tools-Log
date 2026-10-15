<template>
  <el-container class="main-layout">
    <!-- 桌面端侧边栏 -->
    <el-aside v-if="!isMobile" :width="collapsed ? '64px' : '220px'" class="sidebar">
      <SidebarContent :collapsed="collapsed" @navigate="handleNavigate" />
    </el-aside>

    <!-- 移动端抽屉侧边栏 -->
    <el-drawer
      v-else
      v-model="drawerVisible"
      direction="ltr"
      :size="240"
      :with-header="false"
      :z-index="3000"
    >
      <SidebarContent :collapsed="false" @navigate="drawerVisible = false" />
    </el-drawer>

    <el-container class="main-container">
      <!-- 顶部栏 -->
      <el-header class="header" height="56px">
        <div class="header-left">
          <el-icon
            v-if="isMobile"
            class="menu-btn"
            :size="22"
            @click="drawerVisible = true"
          >
            <Fold />
          </el-icon>
          <el-icon
            v-else
            class="menu-btn"
            :size="20"
            @click="collapsed = !collapsed"
          >
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
          <span class="header-title">{{ routeTitle }}</span>
        </div>

        <div class="header-right">
          <!-- 消息提醒：点击进入收件箱 -->
          <div class="notice-btn" @click="router.push('/inbox')">
            <el-badge :value="unreadCount" :max="99" :hidden="unreadCount === 0">
              <el-icon :size="20"><Bell /></el-icon>
            </el-badge>
          </div>
          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" class="user-avatar">
                {{ userStore.user?.displayName?.charAt(0) }}
              </el-avatar>
              <span v-if="!isMobile" class="user-name">
                {{ userStore.user?.displayName }}
                <el-tag size="small" type="primary" effect="light">{{ userStore.roleLabel }}</el-tag>
              </span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人设置
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import { useConfigStore } from '../../stores/config';
import { notificationApi } from '../../api';
import SidebarContent from './SidebarContent.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const appStore = useAppStore();
const configStore = useConfigStore();

const drawerVisible = ref(false);
const collapsed = ref(false);

const isMobile = computed(() => appStore.isMobile);
const routeTitle = computed(() => (route.meta.title as string) || '');

// 顶栏消息提醒：未读数轮询（60s 一次）
const unreadCount = ref(0);
let unreadTimer: ReturnType<typeof setInterval> | undefined;

async function refreshUnread() {
  if (!userStore.isLoggedIn) return;
  try {
    const res = await notificationApi.unreadCount();
    unreadCount.value = res.data.count || 0;
  } catch {
    // 忽略轮询失败
  }
}

onMounted(() => {
  refreshUnread();
  unreadTimer = setInterval(refreshUnread, 60_000);
});

onUnmounted(() => {
  if (unreadTimer) clearInterval(unreadTimer);
});

function handleNavigate() {
  drawerVisible.value = false;
}

function handleCommand(command: string) {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' }).then(() => {
      userStore.logout();
      configStore.reset();
      router.push('/login');
    });
  } else if (command === 'profile') {
    router.push('/profile');
  }
}
</script>

<style scoped>
.main-layout {
  height: 100vh;
}

.sidebar {
  background: #1d2939;
  transition: width 0.3s;
  overflow: hidden;
}

.main-container {
  flex-direction: column;
}

.header {
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: saturate(180%) blur(10px);
  -webkit-backdrop-filter: saturate(180%) blur(10px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-lighter, #ebeef5);
  z-index: 10;
  padding: 0 16px;
  position: sticky;
  top: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-btn {
  cursor: pointer;
  color: var(--text-regular, #606266);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.menu-btn:hover {
  color: var(--primary-color, #409eff);
  background: #ecf5ff;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  letter-spacing: 0.3px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 消息提醒图标 */
.notice-btn {
  cursor: pointer;
  color: var(--text-regular, #606266);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  transition: background 0.2s, color 0.2s;
}

.notice-btn:hover {
  color: var(--primary-color, #409eff);
  background: #ecf5ff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px 4px 4px;
  border-radius: 10px;
  transition: background 0.2s;
}

.user-info:hover {
  background: #f5f7fa;
}

.user-avatar {
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.3);
}

.user-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #303133;
}

.content {
  background: var(--bg-color, #f5f7fa);
  overflow-y: auto;
  padding: 0;
}

/* 移动端抽屉内部样式 */
:deep(.el-drawer__body) {
  padding: 0;
  background: #1d2939;
}
</style>
