<template>
  <div class="page-container" v-if="project">
    <div class="page-header">
      <el-button link @click="$router.back()" class="back-btn">
        <el-icon><ArrowLeft /></el-icon>返回
      </el-button>
      <div class="page-title">{{ project.name }}</div>
      <div class="page-desc">
        {{ project.description || '暂无描述' }}
        <el-tag :type="project.status === 'active' ? 'success' : 'info'" size="small" style="margin-left: 8px">
          {{ project.status === 'active' ? '进行中' : '已归档' }}
        </el-tag>
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 成员管理 -->
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-header-row">
              <span class="card-title">项目成员（{{ project.members?.length || 0 }}）</span>
              <el-button v-if="canManage" type="primary" size="small" @click="showAddMember">
                <el-icon><Plus /></el-icon>添加成员
              </el-button>
            </div>
          </template>

          <el-table v-if="!isMobile" :data="project.members" stripe>
            <el-table-column prop="displayName" label="姓名" width="120">
              <template #default="{ row }">
                <span>{{ row.displayName }}</span>
                <span class="text-muted">（{{ row.username }}）</span>
              </template>
            </el-table-column>
            <el-table-column label="项目角色" width="130">
              <template #default="{ row }">
                <el-tag :type="roleTagType(row.projectRole)" size="small">
                  {{ roleLabel(row.projectRole) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="groupName" label="所属小组" width="130">
              <template #default="{ row }">{{ row.groupName || '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" v-if="canManage">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="showEditMember(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleRemoveMember(row)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- 移动端成员列表 -->
          <div v-else class="mobile-member-list">
            <div v-for="m in project.members" :key="m.userId" class="mobile-member-item">
              <div class="member-main">
                <div class="member-name">
                  {{ m.displayName }}
                  <el-tag :type="roleTagType(m.projectRole)" size="small">
                    {{ roleLabel(m.projectRole) }}
                  </el-tag>
                </div>
                <div class="member-sub">{{ m.username }}{{ m.groupName ? ' · ' + m.groupName : '' }}</div>
              </div>
              <div v-if="canManage" class="member-actions">
                <el-button link type="primary" size="small" @click="showEditMember(m)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleRemoveMember(m)">移除</el-button>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 小组管理 -->
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-header-row">
              <span class="card-title">项目小组（{{ project.groups?.length || 0 }}）</span>
              <el-button v-if="canManage" type="primary" size="small" @click="showCreateGroup">
                <el-icon><Plus /></el-icon>新建小组
              </el-button>
            </div>
          </template>

          <div v-if="project.groups?.length">
            <div v-for="group in project.groups" :key="group.id" class="group-item">
              <div class="group-info">
                <div class="group-name">
                  <el-icon><Collection /></el-icon>{{ group.name }}
                </div>
                <div class="group-leader">
                  组长：{{ group.leaderName || '未指定' }}
                  <span class="group-count">
                    （{{ memberCountOfGroup(group.id) }} 人）
                  </span>
                </div>
              </div>
              <el-button v-if="canManage" link type="danger" size="small" @click="handleDeleteGroup(group)">
                删除
              </el-button>
            </div>
          </div>
          <el-empty v-else description="暂无小组" :image-size="60" />
        </el-card>

        <!-- 项目信息编辑 -->
        <el-card shadow="never" v-if="canManage" class="edit-card">
          <template #header>
            <span class="card-title">项目设置</span>
          </template>
          <el-form label-position="top">
            <el-form-item label="项目名称">
              <el-input v-model="editForm.name" />
            </el-form-item>
            <el-form-item label="项目描述">
              <el-input v-model="editForm.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="项目状态">
              <el-select v-model="editForm.status" style="width: 100%">
                <el-option label="进行中" value="active" />
                <el-option label="已归档" value="archived" />
              </el-select>
            </el-form-item>
            <el-button type="primary" :loading="savingProject" style="width: 100%" @click="handleUpdateProject">
              保存项目设置
            </el-button>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- 添加成员对话框 -->
    <el-dialog v-model="addMemberVisible" title="添加项目成员" :width="isMobile ? '92%' : '480px'">
      <el-form label-position="top">
        <el-form-item label="选择用户">
          <el-select
            v-model="addMemberForm.userId"
            filterable
            remote
            :remote-method="searchAvailableUsers"
            :loading="searchingUsers"
            placeholder="输入用户名/姓名/邮箱搜索"
            style="width: 100%"
          >
            <el-option
              v-for="u in availableUsers"
              :key="u.id"
              :label="`${u.display_name}（${u.username}）`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="项目角色">
          <el-select v-model="addMemberForm.projectRole" style="width: 100%">
            <el-option label="项目经理" value="manager" :disabled="hasManager" />
            <el-option label="小组长" value="leader" />
            <el-option label="组员" value="member" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属小组（可选）">
          <el-select v-model="addMemberForm.groupId" clearable placeholder="不分组" style="width: 100%">
            <el-option v-for="g in project.groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addMemberVisible = false">取消</el-button>
        <el-button type="primary" :loading="addingMember" @click="handleAddMember">添加</el-button>
      </template>
    </el-dialog>

    <!-- 编辑成员对话框 -->
    <el-dialog v-model="editMemberVisible" title="编辑成员" :width="isMobile ? '92%' : '480px'">
      <el-form label-position="top" v-if="editingMember">
        <el-form-item label="项目角色">
          <el-select v-model="editMemberForm.projectRole" style="width: 100%">
            <el-option label="项目经理" value="manager" :disabled="hasManagerOtherThan(editingMember.userId)" />
            <el-option label="小组长" value="leader" />
            <el-option label="组员" value="member" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属小组">
          <el-select v-model="editMemberForm.groupId" clearable placeholder="不分组" style="width: 100%">
            <el-option v-for="g in project.groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editMemberVisible = false">取消</el-button>
        <el-button type="primary" :loading="updatingMember" @click="handleUpdateMember">保存</el-button>
      </template>
    </el-dialog>

    <!-- 创建小组对话框 -->
    <el-dialog v-model="createGroupVisible" title="新建小组" :width="isMobile ? '92%' : '480px'">
      <el-form label-position="top">
        <el-form-item label="小组名称">
          <el-input v-model="createGroupForm.name" placeholder="请输入小组名称" />
        </el-form-item>
        <el-form-item label="指定组长（从项目成员中选择）">
          <el-select v-model="createGroupForm.leaderId" clearable filterable placeholder="可稍后指定" style="width: 100%">
            <el-option
              v-for="m in project.members"
              :key="m.userId"
              :label="m.displayName"
              :value="m.userId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createGroupVisible = false">取消</el-button>
        <el-button type="primary" :loading="creatingGroup" @click="handleCreateGroup">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { projectApi, userApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import type { Project, ProjectGroup, ProjectMember } from '../../types';

const route = useRoute();
const userStore = useUserStore();
const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

const projectId = computed(() => parseInt(route.params.id as string, 10));
const project = ref<Project | null>(null);
const loading = ref(false);

// 是否可管理（总监或该项目经理）
const canManage = computed(() => {
  if (!project.value) return false;
  return userStore.isDirector || project.value.myRole === 'manager';
});

const hasManager = computed(() =>
  project.value?.members?.some((m) => m.projectRole === 'manager')
);

function hasManagerOtherThan(userId: number) {
  return project.value?.members?.some((m) => m.projectRole === 'manager' && m.userId !== userId);
}

function roleLabel(role: string) {
  const map: Record<string, string> = { manager: '项目经理', leader: '小组长', member: '组员' };
  return map[role] || role;
}

function roleTagType(role: string) {
  const map: Record<string, string> = { manager: 'danger', leader: 'warning', member: 'info' };
  return map[role] || 'info';
}

function memberCountOfGroup(groupId: number) {
  return project.value?.members?.filter((m) => m.groupId === groupId).length || 0;
}

// ==================== 项目信息编辑 ====================
const editForm = reactive({ name: '', description: '', status: 'active' });
const savingProject = ref(false);

async function handleUpdateProject() {
  savingProject.value = true;
  try {
    await projectApi.update(projectId.value, {
      name: editForm.name,
      description: editForm.description,
      status: editForm.status,
    });
    ElMessage.success('项目已更新');
    loadProject();
  } finally {
    savingProject.value = false;
  }
}

// ==================== 成员管理 ====================
const addMemberVisible = ref(false);
const addingMember = ref(false);
const availableUsers = ref<any[]>([]);
const searchingUsers = ref(false);
const addMemberForm = reactive({ userId: undefined as number | undefined, projectRole: 'member', groupId: undefined as number | undefined });

const editMemberVisible = ref(false);
const updatingMember = ref(false);
const editingMember = ref<ProjectMember | null>(null);
const editMemberForm = reactive({ projectRole: 'member', groupId: undefined as number | undefined });

function showAddMember() {
  addMemberForm.userId = undefined;
  addMemberForm.projectRole = 'member';
  addMemberForm.groupId = undefined;
  availableUsers.value = [];
  searchAvailableUsers('');
  addMemberVisible.value = true;
}

async function searchAvailableUsers(keyword: string) {
  searchingUsers.value = true;
  try {
    const res = await userApi.available(projectId.value, keyword);
    availableUsers.value = res.data || [];
  } finally {
    searchingUsers.value = false;
  }
}

async function handleAddMember() {
  if (!addMemberForm.userId) {
    ElMessage.warning('请选择用户');
    return;
  }
  addingMember.value = true;
  try {
    await projectApi.addMember(projectId.value, {
      userId: addMemberForm.userId,
      projectRole: addMemberForm.projectRole,
      groupId: addMemberForm.groupId,
    });
    ElMessage.success('成员添加成功');
    addMemberVisible.value = false;
    loadProject();
  } finally {
    addingMember.value = false;
  }
}

function showEditMember(member: ProjectMember) {
  editingMember.value = member;
  editMemberForm.projectRole = member.projectRole;
  editMemberForm.groupId = member.groupId || undefined;
  editMemberVisible.value = true;
}

async function handleUpdateMember() {
  if (!editingMember.value) return;
  updatingMember.value = true;
  try {
    await projectApi.updateMember(projectId.value, editingMember.value.userId, {
      projectRole: editMemberForm.projectRole,
      groupId: editMemberForm.groupId ?? undefined,
    });
    ElMessage.success('成员信息已更新');
    editMemberVisible.value = false;
    loadProject();
  } finally {
    updatingMember.value = false;
  }
}

async function handleRemoveMember(member: ProjectMember) {
  await ElMessageBox.confirm(
    `确定要将「${member.displayName}」移出项目吗？`,
    '提示',
    { type: 'warning' }
  );
  await projectApi.removeMember(projectId.value, member.userId);
  ElMessage.success('成员已移除');
  loadProject();
}

// ==================== 小组管理 ====================
const createGroupVisible = ref(false);
const creatingGroup = ref(false);
const createGroupForm = reactive({ name: '', leaderId: undefined as number | undefined });

function showCreateGroup() {
  createGroupForm.name = '';
  createGroupForm.leaderId = undefined;
  createGroupVisible.value = true;
}

async function handleCreateGroup() {
  if (!createGroupForm.name.trim()) {
    ElMessage.warning('请输入小组名称');
    return;
  }
  creatingGroup.value = true;
  try {
    await projectApi.createGroup(projectId.value, {
      name: createGroupForm.name,
      leaderId: createGroupForm.leaderId,
    });
    ElMessage.success('小组创建成功');
    createGroupVisible.value = false;
    loadProject();
  } finally {
    creatingGroup.value = false;
  }
}

async function handleDeleteGroup(group: ProjectGroup) {
  await ElMessageBox.confirm(
    `确定要删除小组「${group.name}」吗？组内成员将变为未分组。`,
    '提示',
    { type: 'warning' }
  );
  await projectApi.deleteGroup(projectId.value, group.id);
  ElMessage.success('小组已删除');
  loadProject();
}

// ==================== 加载 ====================
async function loadProject() {
  loading.value = true;
  try {
    const res = await projectApi.list();
    const found = (res.data || []).find((p) => p.id === projectId.value);
    project.value = found || null;
    if (found) {
      editForm.name = found.name;
      editForm.description = found.description || '';
      editForm.status = found.status;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(loadProject);
</script>

<style scoped>
.back-btn {
  margin-bottom: 8px;
  font-size: 13px;
}

.card-title {
  font-weight: 600;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.text-muted {
  color: #c0c4cc;
  font-size: 12px;
}

/* 移动端成员列表 */
.mobile-member-list {
  display: flex;
  flex-direction: column;
}

.mobile-member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f5;
}

.mobile-member-item:last-child {
  border-bottom: none;
}

.member-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.member-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* 小组 */
.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  margin-bottom: 10px;
}

.group-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.group-leader {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.group-count {
  color: #c0c4cc;
}

.edit-card {
  margin-top: 16px;
}
</style>
