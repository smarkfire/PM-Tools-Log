<template>
  <div class="page-container" v-if="project">
    <div class="page-hero">
      <div class="hero-top">
        <el-button link class="hero-back" @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>返回
        </el-button>
      </div>
      <div class="hero-bottom">
        <div class="hero-main">
          <div class="hero-avatar">{{ project.name.slice(0, 1) }}</div>
          <div class="hero-info">
            <div class="hero-title">
              {{ project.name }}
              <span class="hero-status" :class="project.status === 'active' ? 'is-active' : 'is-archived'">
                <i class="dot"></i>{{ project.status === 'active' ? '进行中' : '已归档' }}
              </span>
            </div>
            <div class="hero-desc">{{ project.description || '暂无描述' }}</div>
          </div>
        </div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="stat-num">{{ project.members?.length || 0 }}</div>
            <div class="stat-label">成员</div>
          </div>
          <div class="hero-stat">
            <div class="stat-num">{{ project.groups?.length || 0 }}</div>
            <div class="stat-label">小组</div>
          </div>
          <div class="hero-stat">
            <div class="stat-num">{{ leaderCount }}</div>
            <div class="stat-label">组长</div>
          </div>
        </div>
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
            <el-table-column prop="displayName" label="姓名" min-width="140">
              <template #default="{ row }">
                <div class="member-cell">
                  <span class="member-avatar">{{ row.displayName.slice(0, 1) }}</span>
                  <div class="member-cell-text">
                    <div class="member-realname">{{ row.displayName }}</div>
                    <div class="member-username">{{ row.username }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="项目角色" width="130">
              <template #default="{ row }">
                <el-tag :type="roleTagType(row.projectRole)" size="small">
                  {{ roleLabel(row.projectRole) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="所属小组" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ memberGroupLabel(row) }}</template>
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
              <span class="member-avatar">{{ m.displayName.slice(0, 1) }}</span>
              <div class="member-main">
                <div class="member-name">
                  {{ m.displayName }}
                  <el-tag :type="roleTagType(m.projectRole)" size="small">
                    {{ roleLabel(m.projectRole) }}
                  </el-tag>
                </div>
                <div class="member-sub">{{ m.username }}{{ memberGroupLabel(m) ? ' · ' + memberGroupLabel(m) : '' }}</div>
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
            <div v-for="group in project.groups" :key="group.id" class="group-item item-card">
              <div class="group-badge">{{ group.name.slice(0, 1) }}</div>
              <div class="group-info">
                <div class="group-name">{{ group.name }}</div>
                <div class="group-leader">
                  组长：{{ group.leaderName || '未指定' }}
                  <span class="group-count">· {{ memberCountOfGroup(group.id) }} 人</span>
                </div>
              </div>
              <div v-if="canManage" class="group-actions">
                <el-button link type="primary" size="small" @click="showEditGroup(group)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteGroup(group)">
                  删除
                </el-button>
              </div>
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
        <el-form-item label="所属小组（可多选，跨组协作）">
          <el-select
            v-model="addMemberForm.groupIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            placeholder="不分组"
            style="width: 100%"
          >
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
        <el-form-item label="所属小组（可多选，跨组协作）">
          <el-select
            v-model="editMemberForm.groupIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            placeholder="不分组"
            style="width: 100%"
          >
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

    <!-- 编辑小组对话框 -->
    <el-dialog v-model="editGroupVisible" title="编辑小组" :width="isMobile ? '92%' : '480px'">
      <el-form label-position="top">
        <el-form-item label="小组名称">
          <el-input v-model="editGroupForm.name" placeholder="请输入小组名称" />
        </el-form-item>
        <el-form-item label="指定组长（从项目成员中选择）">
          <el-select
            v-model="editGroupForm.leaderId"
            clearable
            filterable
            placeholder="未指定"
            style="width: 100%"
          >
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
        <el-button @click="editGroupVisible = false">取消</el-button>
        <el-button type="primary" :loading="updatingGroup" @click="handleUpdateGroup">保存</el-button>
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

/** 组长人数（头部统计用） */
const leaderCount = computed(
  () => project.value?.members?.filter((m) => m.projectRole === 'leader').length || 0
);

function roleLabel(role: string) {
  const map: Record<string, string> = { manager: '项目经理', leader: '小组长', member: '组员' };
  return map[role] || role;
}

function roleTagType(role: string) {
  const map: Record<string, string> = { manager: 'danger', leader: 'warning', member: 'info' };
  return map[role] || 'info';
}

function memberCountOfGroup(groupId: number) {
  return (
    project.value?.members?.filter((m) =>
      m.groupIds?.length ? m.groupIds.includes(groupId) : m.groupId === groupId
    ).length || 0
  );
}

/** 成员的小组展示文本（多组时用顿号连接） */
function memberGroupLabel(m: ProjectMember): string {
  if (m.groupNames?.length) return m.groupNames.join('、');
  return m.groupName || '';
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
const addMemberForm = reactive({ userId: undefined as number | undefined, projectRole: 'member', groupIds: [] as number[] });

const editMemberVisible = ref(false);
const updatingMember = ref(false);
const editingMember = ref<ProjectMember | null>(null);
const editMemberForm = reactive({ projectRole: 'member', groupIds: [] as number[] });

function showAddMember() {
  addMemberForm.userId = undefined;
  addMemberForm.projectRole = 'member';
  addMemberForm.groupIds = [];
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
      groupIds: addMemberForm.groupIds,
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
  // 多组归属：优先用后端返回的 groupIds，兼容旧数据回退主组 groupId
  editMemberForm.groupIds = member.groupIds?.length
    ? [...member.groupIds]
    : member.groupId
      ? [member.groupId]
      : [];
  editMemberVisible.value = true;
}

async function handleUpdateMember() {
  if (!editingMember.value) return;
  updatingMember.value = true;
  try {
    await projectApi.updateMember(projectId.value, editingMember.value.userId, {
      projectRole: editMemberForm.projectRole,
      groupIds: editMemberForm.groupIds,
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

// ==================== 编辑小组 ====================
const editGroupVisible = ref(false);
const updatingGroup = ref(false);
const editGroupForm = reactive({ groupId: 0, name: '', leaderId: undefined as number | undefined });

function showEditGroup(group: ProjectGroup) {
  editGroupForm.groupId = group.id;
  editGroupForm.name = group.name;
  editGroupForm.leaderId = group.leader_id ?? undefined;
  editGroupVisible.value = true;
}

async function handleUpdateGroup() {
  if (!editGroupForm.name.trim()) {
    ElMessage.warning('请输入小组名称');
    return;
  }
  updatingGroup.value = true;
  try {
    await projectApi.updateGroup(projectId.value, editGroupForm.groupId, {
      name: editGroupForm.name.trim(),
      leaderId: editGroupForm.leaderId ?? null,
    });
    ElMessage.success('小组已更新');
    editGroupVisible.value = false;
    loadProject();
  } catch (e: any) {
    ElMessage.error('更新失败：' + (e?.response?.data?.message || e?.message || '网络异常'));
  } finally {
    updatingGroup.value = false;
  }
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
/* ==================== 头部横幅 ==================== */
.page-hero {
  position: relative;
  border-radius: 12px;
  padding: 14px 26px 22px;
  margin-bottom: 16px;
  background: linear-gradient(120deg, #2b7de9 0%, #409eff 48%, #7c5cff 100%);
  color: #fff;
  overflow: hidden;
}

/* 装饰圆 */
.page-hero::before,
.page-hero::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.09);
  pointer-events: none;
}

.page-hero::before {
  width: 220px;
  height: 220px;
  right: -60px;
  top: -120px;
}

.page-hero::after {
  width: 140px;
  height: 140px;
  left: 34%;
  bottom: -80px;
}

.hero-top {
  margin-bottom: 10px;
}

.hero-back {
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
}

.hero-back:hover {
  color: #fff;
}

.hero-bottom {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.hero-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.hero-avatar {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  flex-shrink: 0;
}

.hero-info {
  min-width: 0;
}

.hero-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  flex-wrap: wrap;
}

.hero-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.hero-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #cfd8e3;
}

.hero-status.is-active .dot {
  background: #67c23a;
  box-shadow: 0 0 6px rgba(103, 194, 58, 0.9);
}

.hero-desc {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-stats {
  display: flex;
  gap: 30px;
  flex-shrink: 0;
}

.hero-stat {
  text-align: center;
}

.hero-stat + .hero-stat {
  border-left: 1px solid rgba(255, 255, 255, 0.25);
  padding-left: 30px;
}

.stat-num {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  margin-top: 2px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}

/* ==================== 卡片标题装饰 ==================== */
.card-title {
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.card-title::before {
  content: '';
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, #409eff, #7c5cff);
}

/* ==================== 成员 ==================== */
.member-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-cell-text {
  min-width: 0;
}

.member-realname {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.3;
}

.member-username {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* 移动端成员列表 */
.mobile-member-list {
  display: flex;
  flex-direction: column;
}

.mobile-member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-lighter);
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
  color: var(--text-secondary);
  margin-top: 4px;
}

/* ==================== 小组 ==================== */
.group-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  border-radius: 10px;
}

.group-badge {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #409eff, #7c5cff);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.group-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.group-leader {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 3px;
}

.group-count {
  color: var(--text-placeholder);
}

.edit-card {
  margin-top: 16px;
}

/* ==================== 移动端适配 ==================== */
@media (max-width: 768px) {
  .page-hero {
    padding: 12px 18px 18px;
  }

  .hero-stats {
    width: 100%;
    justify-content: space-around;
    gap: 0;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.22);
  }

  .hero-stat + .hero-stat {
    border-left: none;
    padding-left: 0;
  }

  .hero-desc {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}
</style>
