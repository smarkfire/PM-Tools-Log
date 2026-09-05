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
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import { useConfigStore } from '../../stores/config';
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
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  z-index: 10;
  padding: 0 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.menu-btn {
  cursor: pointer;
  color: #606266;
}

.menu-btn:hover {
  color: #409eff;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.user-avatar {
  background: #409eff;
  color: #fff;
  font-weight: 600;
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
