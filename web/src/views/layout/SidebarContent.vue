<template>
  <div class="sidebar-content">
    <div class="logo-area" @click="$router.push('/dashboard')">
      <el-icon :size="26" color="#409eff"><Notebook /></el-icon>
      <span v-if="!collapsed" class="logo-text">日志管理系统</span>
    </div>

    <el-menu
      :default-active="activeMenu"
      :collapse="collapsed"
      background-color="#1d2939"
      text-color="#aeb8c5"
      active-text-color="#ffffff"
      router
      class="sidebar-menu"
      :collapse-transition="false"
    >
      <el-menu-item index="/dashboard">
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

      <el-menu-item v-if="menus.reports" index="/reports">
        <el-icon><DataAnalysis /></el-icon>
        <template #title>报告中心</template>
      </el-menu-item>

      <el-menu-item v-if="menus.chat" index="/chat">
        <el-icon><ChatDotRound /></el-icon>
        <template #title>AI 助手</template>
      </el-menu-item>

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
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user';
import { useConfigStore } from '../../stores/config';

defineProps<{ collapsed?: boolean }>();

const route = useRoute();
const userStore = useUserStore();
const configStore = useConfigStore();

const activeMenu = computed(() => route.path);
const menus = computed(() => configStore.menuVisibility);

onMounted(() => {
  // 登录后拉取菜单开关（未加载完成时默认全部可见）
  if (userStore.isLoggedIn && !configStore.loaded) {
    configStore.fetchMenus();
  }
});

// 总监/项目经理/小组长可查看团队日志
const canViewTeamLogs = computed(() => {
  const role = userStore.user?.role;
  const memberships = userStore.userInfo?.memberships || [];
  const hasManagerOrLeader = memberships.some(
    (m) => m.projectRole === 'manager' || m.projectRole === 'leader'
  );
  return role === 'director' || role === 'manager' || role === 'leader' || hasManagerOrLeader;
});
</script>

<style scoped>
.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.logo-area {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.sidebar-menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 100%;
}

:deep(.el-menu-item.is-active) {
  background: #409eff !important;
}

:deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.06);
}
</style>
