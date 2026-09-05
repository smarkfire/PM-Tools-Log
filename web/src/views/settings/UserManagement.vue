<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">用户管理</div>
      <div class="page-desc">管理系统用户的全局角色（仅项目总监可见）</div>
    </div>

    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="keyword"
          placeholder="搜索用户名/姓名/邮箱"
          clearable
          style="width: 260px"
          @keyup.enter="loadUsers"
          @clear="loadUsers"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="loadUsers">查询</el-button>
      </div>
    </el-card>

    <el-card shadow="never" v-loading="loading">
      <el-table v-if="!isMobile" :data="users" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="display_name" label="姓名" width="120" />
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="email" label="邮箱" min-width="160" />
        <el-table-column label="全局角色" width="150">
          <template #default="{ row }">
            <el-select
              :model-value="row.role"
              size="small"
              :disabled="row.id === userStore.user?.id"
              @change="(val: string) => handleRoleChange(row, val)"
            >
              <el-option label="项目总监" value="director" />
              <el-option label="项目经理" value="manager" />
              <el-option label="小组长" value="leader" />
              <el-option label="成员" value="member" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="项目参与" min-width="220">
          <template #default="{ row }">
            <template v-if="row.memberships?.length">
              <el-tag
                v-for="m in row.memberships"
                :key="m.projectId"
                size="small"
                effect="plain"
                class="member-tag"
              >
                {{ m.projectName }}·{{ roleLabel(m.projectRole) }}
              </el-tag>
            </template>
            <span v-else class="text-muted">暂未参与项目</span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="160">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>

      <!-- 移动端卡片 -->
      <div v-else class="mobile-user-list">
        <div v-for="u in users" :key="u.id" class="mobile-user-item">
          <div class="user-top">
            <span class="user-name">{{ u.display_name }}</span>
            <el-select
              :model-value="u.role"
              size="small"
              style="width: 120px"
              :disabled="u.id === userStore.user?.id"
              @change="(val: string) => handleRoleChange(u, val)"
            >
              <el-option label="项目总监" value="director" />
              <el-option label="项目经理" value="manager" />
              <el-option label="小组长" value="leader" />
              <el-option label="成员" value="member" />
            </el-select>
          </div>
          <div class="user-sub">{{ u.username }} · {{ u.email }}</div>
          <div class="user-members" v-if="u.memberships?.length">
            <el-tag v-for="m in u.memberships" :key="m.projectId" size="small" effect="plain" class="member-tag">
              {{ m.projectName }}·{{ roleLabel(m.projectRole) }}
            </el-tag>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';

const userStore = useUserStore();
const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

const users = ref<any[]>([]);
const keyword = ref('');
const loading = ref(false);

function roleLabel(role: string) {
  const map: Record<string, string> = { manager: '经理', leader: '组长', member: '成员' };
  return map[role] || role;
}

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

async function loadUsers() {
  loading.value = true;
  try {
    const res = await userApi.list(keyword.value || undefined);
    users.value = res.data || [];
  } finally {
    loading.value = false;
  }
}

async function handleRoleChange(user: any, newRole: string) {
  await ElMessageBox.confirm(
    `确定将「${user.display_name}」的全局角色修改为「${roleLabel(newRole) || newRole}」吗？`,
    '角色变更',
    { type: 'warning' }
  );
  await userApi.updateRole(user.id, newRole);
  ElMessage.success('角色已更新');
  loadUsers();
}

onMounted(loadUsers);
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.text-muted {
  color: #c0c4cc;
  font-size: 12px;
}

.member-tag {
  margin: 2px 4px 2px 0;
}

/* 移动端 */
.mobile-user-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-user-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
}

.user-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.user-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.user-sub {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.user-members {
  display: flex;
  flex-wrap: wrap;
}
</style>
