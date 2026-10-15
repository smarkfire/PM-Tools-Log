<template>
  <div class="sidebar-content">
    <div class="logo-area" @click="$router.push('/dashboard')">
      <div class="logo-mark">
        <el-icon :size="20" color="#fff"><Notebook /></el-icon>
      </div>
      <span v-if="!collapsed" class="logo-text">日志管理系统</span>
    </div>

    <el-menu
      :default-active="activeMenu"
      :collapse="collapsed"
      background-color="transparent"
      text-color="#98a2b3"
      active-text-color="#ffffff"
      router
      class="sidebar-menu"
      :collapse-transition="false"
    >
      <div v-if="!collapsed" class="menu-group-title">工作</div>
      <el-menu-item v-if="menus.dashboard !== false" index="/dashboard">
        <el-icon><Odometer /></el-icon>
        <template #title>工作台</template>
      </el-menu-item>

      <el-menu-item v-if="menus.logsWrite" index="/logs/write">
        <el-icon><EditPen /></el-icon>
        <template #title>填写日志</template>
      </el-menu-item>

      <el-menu-item v-if="menus.logs" index="/logs">
        <el-icon><Document /></el-icon>
        <template #title>我的日志</template>
      </el-menu-item>

      <el-menu-item v-if="menus.logsAll && canViewTeamLogs" index="/logs/all">
        <el-icon><Files /></el-icon>
        <template #title>团队日志</template>
      </el-menu-item>

      <el-menu-item v-if="menus.projects" index="/projects">
        <el-icon><Folder /></el-icon>
        <template #title>项目管理</template>
      </el-menu-item>

      <div v-if="!collapsed" class="menu-group-title">协同</div>
      <el-menu-item v-if="menus.reports" index="/reports">
        <el-icon><DataAnalysis /></el-icon>
        <template #title>报告中心</template>
      </el-menu-item>

      <el-menu-item v-if="menus.chat" index="/chat">
        <el-icon><ChatDotRound /></el-icon>
        <template #title>AI 助手</template>
      </el-menu-item>

      <el-menu-item v-if="menus.inbox !== false" index="/inbox">
        <el-icon><Bell /></el-icon>
        <template #title>
          <span class="menu-title-with-badge">
            收件箱
            <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="menu-badge" />
          </span>
        </template>
      </el-menu-item>

      <el-menu-item v-if="menus.approvals !== false" index="/approvals">
        <el-icon><Checked /></el-icon>
        <template #title>审批中心</template>
      </el-menu-item>

      <el-menu-item v-if="menus.feedback !== false" index="/feedback">
        <el-icon><Promotion /></el-icon>
        <template #title>意见反馈</template>
      </el-menu-item>

      <div v-if="!collapsed && (menus.prompts || (userStore.isDirector && menus.users) || userStore.isDirector)" class="menu-group-title">配置</div>
      <el-menu-item v-if="menus.prompts" index="/prompts">
        <el-icon><MagicStick /></el-icon>
        <template #title>提示词配置</template>
      </el-menu-item>

      <el-menu-item v-if="userStore.isDirector && menus.users" index="/users">
        <el-icon><UserFilled /></el-icon>
        <template #title>用户管理</template>
      </el-menu-item>

      <el-menu-item v-if="userStore.isDirector" index="/admin/settings">
        <el-icon><Setting /></el-icon>
        <template #title>系统设置</template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user';
import { useConfigStore } from '../../stores/config';
import { notificationApi } from '../../api';

defineProps<{ collapsed?: boolean }>();

const route = useRoute();
const userStore = useUserStore();
const configStore = useConfigStore();

const activeMenu = computed(() => route.path);
const menus = computed(() => configStore.menuVisibility);

// 收件箱未读数（定时轮询刷新徽标）
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
  // 登录后拉取菜单开关（未加载完成时默认全部可见）
  if (userStore.isLoggedIn && !configStore.loaded) {
    configStore.fetchMenus();
  }
  refreshUnread();
  unreadTimer = setInterval(refreshUnread, 60_000);
});

onUnmounted(() => {
  if (unreadTimer) clearInterval(unreadTimer);
});

// 总监/管理员/项目经理/小组长可查看团队日志
const canViewTeamLogs = computed(() => {
  const role = userStore.user?.role;
  const memberships = userStore.userInfo?.memberships || [];
  const hasManagerOrLeader = memberships.some(
    (m) => m.projectRole === 'manager' || m.projectRole === 'leader'
  );
  return role === 'director' || role === 'admin' || role === 'manager' || role === 'leader' || hasManagerOrLeader;
});
</script>

<style scoped>
.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #16222f 0%, #1d2939 40%, #1d2939 100%);
}

.logo-area {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.logo-mark {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.4);
  flex-shrink: 0;
}

.logo-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.menu-group-title {
  padding: 14px 20px 6px;
  font-size: 11px;
  font-weight: 600;
  color: #667085;
  letter-spacing: 1px;
  text-transform: uppercase;
  white-space: nowrap;
}

.sidebar-menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
  padding: 4px 10px;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 100%;
}

/* 菜单项：圆角、悬浮、选中态 */
:deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  margin: 2px 0;
  border-radius: 8px;
  transition: background 0.2s, color 0.2s;
}

:deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.07) !important;
  color: #e4e7ed !important;
}

:deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.95), rgba(64, 158, 255, 0.8)) !important;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.35);
  color: #fff !important;
}

:deep(.el-menu-item.is-active .el-icon) {
  color: #fff !important;
}

.menu-title-with-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.menu-badge :deep(.el-badge__content) {
  border: none;
  box-shadow: 0 0 0 2px #1d2939;
}

/* 折叠态菜单居中图标 */
:deep(.el-menu--collapse .el-menu-item) {
  margin: 2px 0;
  border-radius: 8px;
}

/* 滚动条 */
.sidebar-menu::-webkit-scrollbar {
  width: 4px;
}
.sidebar-menu::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
}
</style>
