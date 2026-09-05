<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">个人设置</div>
    </div>

    <el-row :gutter="16">
      <!-- 基本信息 -->
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header><span>基本信息</span></template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="姓名">{{ userInfo?.displayName }}</el-descriptions-item>
            <el-descriptions-item label="用户名">{{ userInfo?.username }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ userInfo?.email }}</el-descriptions-item>
            <el-descriptions-item label="全局角色">
              <el-tag type="primary" size="small">{{ userStore.roleLabel }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="注册时间">{{ formatTime(userInfo?.created_at) }}</el-descriptions-item>
          </el-descriptions>

          <template v-if="userInfo?.memberships?.length">
            <div class="section-title">项目参与情况</div>
            <div class="membership-list">
              <div v-for="m in userInfo.memberships" :key="m.projectId" class="membership-item">
                <span class="m-project">{{ m.projectName }}</span>
                <el-tag :type="tagType(m.projectRole)" size="small">
                  {{ roleLabel(m.projectRole) }}
                </el-tag>
                <span v-if="m.groupName" class="m-group">{{ m.groupName }}</span>
              </div>
            </div>
          </template>
        </el-card>
      </el-col>

      <!-- 修改密码 + AI 配置 -->
      <el-col :xs="24" :md="12">
        <el-card v-if="menus.aiSettings" shadow="never" class="ai-config-card">
          <template #header>
            <div class="card-header-row">
              <span>AI 服务配置</span>
              <el-tag size="small" type="info">配置后优先于系统默认 Key</el-tag>
            </div>
          </template>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="Key 优先级：这里填写的 > 管理员配置的系统 Key"
            description="留空提交可清除已保存的个人 Key（回退到系统默认）。Key 仅存储在服务器数据库中，界面只显示脱敏值。"
            style="margin-bottom: 16px"
          />

          <el-form label-position="top" v-loading="aiLoading">
            <el-form-item label="通义千问 API Key">
              <el-input
                v-model="aiForm.qwenApiKey"
                :placeholder="aiConfig?.qwenKeySet ? `已配置：${aiConfig.qwenApiKey}` : '未配置，填入 sk-... 后保存'"
                show-password
                clearable
              />
              <div v-if="aiConfig" class="key-source">
                当前生效来源：
                <el-tag :type="sourceTagType(aiConfig.effectiveSource.qwen)" size="small">
                  {{ sourceLabel(aiConfig.effectiveSource.qwen) }}
                </el-tag>
                <span class="key-meta">{{ aiConfig.effective.qwen.model }}</span>
              </div>
            </el-form-item>
            <el-form-item label="DeepSeek API Key">
              <el-input
                v-model="aiForm.deepseekApiKey"
                :placeholder="aiConfig?.deepseekKeySet ? `已配置：${aiConfig.deepseekApiKey}` : '未配置，填入 sk-... 后保存'"
                show-password
                clearable
              />
              <div v-if="aiConfig" class="key-source">
                当前生效来源：
                <el-tag :type="sourceTagType(aiConfig.effectiveSource.deepseek)" size="small">
                  {{ sourceLabel(aiConfig.effectiveSource.deepseek) }}
                </el-tag>
                <span class="key-meta">{{ aiConfig.effective.deepseek.model }}</span>
              </div>
            </el-form-item>
            <el-form-item>
              <div class="ai-actions">
                <el-button type="primary" :loading="aiSaving" @click="saveAiConfig">保存 AI 配置</el-button>
                <el-button
                  v-if="aiConfig?.qwenKeySet || aiConfig?.deepseekKeySet"
                  plain
                  @click="clearMyKeys"
                >清除我的 Key</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never">
          <template #header><span>修改密码</span></template>
          <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="90px">
            <el-form-item label="旧密码" prop="oldPassword">
              <el-input v-model="pwdForm.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="pwdForm.newPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="pwdForm.confirmPassword" type="password" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="changing" @click="handleChangePassword">
                确认修改
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authApi, aiConfigApi, configApi, type MyAiConfig } from '../../api';
import { useUserStore } from '../../stores/user';

const userStore = useUserStore();
const userInfo = computed(() => userStore.userInfo);

const pwdFormRef = ref();
const changing = ref(false);
const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const pwdRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' },
  ],
  confirmPassword: [
    {
      required: true,
      validator: (_rule: any, value: string, callback: any) => {
        if (!value) callback(new Error('请再次输入新密码'));
        else if (value !== pwdForm.newPassword) callback(new Error('两次输入的密码不一致'));
        else callback();
      },
      trigger: 'blur',
    },
  ],
};

function roleLabel(role: string) {
  const map: Record<string, string> = { manager: '项目经理', leader: '小组长', member: '成员' };
  return map[role] || role;
}

// ==================== 用户 AI 配置 ====================
const menus = ref({ aiSettings: true });
const aiConfig = ref<MyAiConfig | null>(null);
const aiLoading = ref(false);
const aiSaving = ref(false);
const aiForm = reactive({ qwenApiKey: '', deepseekApiKey: '' });

function sourceLabel(source: string) {
  const map: Record<string, string> = {
    user: '我的 Key',
    system: '系统配置',
    env: '服务器环境变量',
    none: '未配置',
  };
  return map[source] || source;
}

function sourceTagType(source: string) {
  const map: Record<string, string> = { user: 'success', system: 'primary', env: 'info', none: 'danger' };
  return map[source] || 'info';
}

async function loadAiConfig() {
  aiLoading.value = true;
  try {
    const [menuRes, cfgRes] = await Promise.all([configApi.menus(), aiConfigApi.get()]);
    menus.value = menuRes.data?.menus || { aiSettings: true };
    aiConfig.value = cfgRes.data;
    aiForm.qwenApiKey = '';
    aiForm.deepseekApiKey = '';
  } finally {
    aiLoading.value = false;
  }
}

async function saveAiConfig() {
  aiSaving.value = true;
  try {
    const payload: { qwenApiKey?: string; deepseekApiKey?: string } = {};
    // 仅提交用户主动填写的项（留空表示不修改）
    if (aiForm.qwenApiKey.trim()) payload.qwenApiKey = aiForm.qwenApiKey.trim();
    if (aiForm.deepseekApiKey.trim()) payload.deepseekApiKey = aiForm.deepseekApiKey.trim();
    await aiConfigApi.update(payload);
    ElMessage.success('AI 配置已保存');
    await loadAiConfig();
  } finally {
    aiSaving.value = false;
  }
}

async function clearMyKeys() {
  await ElMessageBox.confirm(
    '确定清除已保存的个人 Key 吗？清除后将回退使用系统默认 Key。',
    '提示',
    { type: 'warning' }
  );
  aiSaving.value = true;
  try {
    await aiConfigApi.update({ qwenApiKey: '', deepseekApiKey: '' });
    ElMessage.success('已清除，将使用系统默认 Key');
    await loadAiConfig();
  } finally {
    aiSaving.value = false;
  }
}

function tagType(role: string) {
  const map: Record<string, string> = { manager: 'danger', leader: 'warning', member: 'info' };
  return map[role] || 'info';
}

function formatTime(t?: string) {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

async function handleChangePassword() {
  await pwdFormRef.value?.validate();
  changing.value = true;
  try {
    await authApi.changePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    });
    ElMessage.success('密码修改成功，请重新登录');
    userStore.logout();
    window.location.href = '/login';
  } finally {
    changing.value = false;
  }
}

onMounted(() => {
  if (!userStore.userInfo) {
    userStore.fetchUserInfo();
  }
  loadAiConfig();
});
</script>

<style scoped>
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-config-card {
  margin-bottom: 16px;
}

.key-source {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-meta {
  color: #c0c4cc;
}

.ai-actions {
  display: flex;
  gap: 10px;
}

.section-title {
  font-weight: 600;
  margin: 20px 0 12px;
  color: #303133;
}

.membership-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.membership-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f8f9fb;
  border-radius: 8px;
}

.m-project {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.m-group {
  font-size: 12px;
  color: #909399;
}
</style>
