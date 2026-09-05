<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">项目管理</div>
      <div class="page-desc">查看和管理您参与的项目</div>
    </div>

    <!-- 操作栏 -->
    <div class="action-bar">
      <el-button v-if="canCreate" type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>创建项目
      </el-button>
    </div>

    <!-- 项目卡片列表（响应式栅格） -->
    <el-row :gutter="16" v-loading="loading">
      <el-col v-for="project in projects" :key="project.id" :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="project-card" @click="$router.push(`/projects/${project.id}`)">
          <div class="project-header">
            <el-icon :size="22" color="#409eff"><Folder /></el-icon>
            <span class="project-name">{{ project.name }}</span>
          </div>
          <div class="project-desc">{{ project.description || '暂无描述' }}</div>
          <div class="project-meta">
            <span class="meta-item">
              <el-icon><User /></el-icon>{{ project.member_count }} 人
            </span>
            <span class="meta-item">
              <el-icon><Document /></el-icon>{{ project.log_count }} 篇日志
            </span>
            <span class="meta-item">
              <el-icon><Collection /></el-icon>{{ project.groups?.length || 0 }} 个小组
            </span>
          </div>
          <div class="project-footer">
            <el-tag
              :type="project.status === 'active' ? 'success' : 'info'"
              size="small"
              effect="light"
            >
              {{ project.status === 'active' ? '进行中' : '已归档' }}
            </el-tag>
            <el-tag v-if="project.myRole" type="primary" size="small" effect="plain">
              {{ roleLabel(project.myRole) }}
            </el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-if="!loading && projects.length === 0" description="暂无项目" />

    <!-- 创建项目对话框 -->
    <el-dialog v-model="createVisible" title="创建项目" :width="isMobile ? '92%' : '520px'">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="80px">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="createForm.name" placeholder="请输入项目名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入项目描述（可选）"
          />
        </el-form-item>
        <el-form-item label="起止日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { projectApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { useAppStore } from '../../stores/app';
import type { Project } from '../../types';

const userStore = useUserStore();
const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

const projects = ref<Project[]>([]);
const loading = ref(false);
const createVisible = ref(false);
const creating = ref(false);
const dateRange = ref<[string, string] | null>(null);
const createFormRef = ref();

const createForm = reactive({
  name: '',
  description: '',
});

const createRules = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
};

// 总监或全局经理角色可创建项目
const canCreate = computed(() =>
  ['director', 'manager'].includes(userStore.user?.role || 'member')
);

function roleLabel(role: string) {
  const map: Record<string, string> = { manager: '项目经理', leader: '小组长', member: '成员' };
  return map[role] || role;
}

function showCreateDialog() {
  createForm.name = '';
  createForm.description = '';
  dateRange.value = null;
  createVisible.value = true;
}

async function handleCreate() {
  await createFormRef.value?.validate();
  creating.value = true;
  try {
    await projectApi.create({
      name: createForm.name,
      description: createForm.description || undefined,
      startDate: dateRange.value?.[0],
      endDate: dateRange.value?.[1],
    });
    ElMessage.success('项目创建成功');
    createVisible.value = false;
    loadProjects();
  } finally {
    creating.value = false;
  }
}

async function loadProjects() {
  loading.value = true;
  try {
    const res = await projectApi.list();
    projects.value = res.data || [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadProjects);
</script>

<style scoped>
.action-bar {
  margin-bottom: 16px;
}

.project-card {
  margin-bottom: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}

.project-card:hover {
  transform: translateY(-3px);
}

.project-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-desc {
  font-size: 13px;
  color: #909399;
  height: 38px;
  line-height: 19px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-bottom: 12px;
}

.project-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.project-footer {
  display: flex;
  gap: 8px;
}
</style>
