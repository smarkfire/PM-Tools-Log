<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">系统设置</div>
      <div class="page-desc">配置系统级 AI 服务（用户未配置自己的 Key 时使用）与功能菜单开关</div>
    </div>

    <el-row :gutter="16">
      <!-- AI 服务配置 -->
      <el-col :xs="24" :md="12">
        <el-card shadow="never" v-loading="loading">
          <template #header>
            <div class="card-header-row">
              <span>系统 AI 服务</span>
              <el-tag size="small" type="info">用户未配置个人 Key 时生效</el-tag>
            </div>
          </template>

          <h4 class="section-title">通义千问（DashScope）</h4>
          <el-form label-position="top">
            <el-form-item label="API Key">
              <el-input
                v-model="form.qwen_api_key"
                :placeholder="configSet.qwen_api_key__set ? '已配置（留空表示不修改）' : '未配置，请输入 sk-...'"
                show-password
                clearable
              />
            </el-form-item>
            <el-form-item label="Base URL">
              <el-input v-model="form.qwen_base_url" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="form.qwen_model" placeholder="qwen-plus" />
            </el-form-item>
          </el-form>

          <el-divider />

          <h4 class="section-title">DeepSeek</h4>
          <el-form label-position="top">
            <el-form-item label="API Key">
              <el-input
                v-model="form.deepseek_api_key"
                :placeholder="configSet.deepseek_api_key__set ? '已配置（留空表示不修改）' : '未配置，请输入 sk-...'"
                show-password
                clearable
              />
            </el-form-item>
            <el-form-item label="Base URL">
              <el-input v-model="form.deepseek_base_url" placeholder="https://api.deepseek.com/v1" />
            </el-form-item>
            <el-form-item label="模型">
              <el-input v-model="form.deepseek_model" placeholder="deepseek-chat" />
            </el-form-item>
          </el-form>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="Key 优先级说明"
            description="用户自己的 Key（个人设置-AI配置） > 此处系统 Key > 服务器 .env 环境变量。API Key 保存后不在界面回显，仅显示脱敏值。"
            style="margin-top: 8px"
          />

          <div class="save-bar">
            <el-button type="primary" :loading="savingAi" @click="saveAiConfig">保存 AI 配置</el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 菜单开关 -->
      <el-col :xs="24" :md="12">
        <el-card shadow="never" v-loading="loading">
          <template #header>
            <div class="card-header-row">
              <span>功能菜单开关</span>
              <el-tag size="small" type="info">控制功能菜单对用户是否可见</el-tag>
            </div>
          </template>

          <el-alert
            type="warning"
            :closable="false"
            show-icon
            title="关闭后，对应用户将无法在侧边栏看到该菜单（接口仍受登录鉴权保护）"
            style="margin-bottom: 16px"
          />

          <div class="menu-switch-list">
            <div v-for="m in menuItems" :key="m.key" class="menu-switch-item">
              <div class="menu-switch-info">
                <div class="menu-switch-name">{{ m.label }}</div>
                <div class="menu-switch-desc">{{ m.desc }}</div>
              </div>
              <el-switch v-model="menuState[m.key]" />
            </div>
          </div>

          <div class="save-bar">
            <el-button type="primary" :loading="savingMenu" @click="saveMenuConfig">保存菜单开关</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminConfigApi } from '../../api';
import { useConfigStore } from '../../stores/config';

const configStore = useConfigStore();

const loading = ref(false);
const savingAi = ref(false);
const savingMenu = ref(false);

/** Key 是否已在服务端设置（用于区分"留空=不修改"与"未配置"） */
const configSet = reactive({ qwen_api_key__set: false, deepseek_api_key__set: false });

const form = reactive({
  qwen_api_key: '',
  qwen_base_url: '',
  qwen_model: '',
  deepseek_api_key: '',
  deepseek_base_url: '',
  deepseek_model: '',
});

/** 菜单开关（本地编辑态） */
const menuState = reactive({
  menu_logs_write: true,
  menu_logs: true,
  menu_logs_all: true,
  menu_projects: true,
  menu_reports: true,
  menu_chat: true,
  menu_prompts: true,
  menu_users: true,
  menu_ai_settings: true,
});

const menuItems = [
  { key: 'menu_logs_write', label: '填写日志', desc: '用户填写每日工作日志' },
  { key: 'menu_logs', label: '我的日志', desc: '查看自己的历史日志' },
  { key: 'menu_logs_all', label: '团队日志', desc: '按权限查看团队日志' },
  { key: 'menu_projects', label: '项目管理', desc: '项目/小组/成员管理' },
  { key: 'menu_reports', label: '报告中心', desc: '周报/月报生成与查看' },
  { key: 'menu_chat', label: 'AI 助手', desc: 'AI 对话功能' },
  { key: 'menu_prompts', label: '提示词配置', desc: '用户自定义提示词' },
  { key: 'menu_users', label: '用户管理', desc: '仅项目总监可见' },
  { key: 'menu_ai_settings', label: '个人 AI 配置', desc: '用户配置自己的 API Key' },
] as const;

onMounted(loadConfig);

async function loadConfig() {
  loading.value = true;
  try {
    const res = await adminConfigApi.get();
    const data = res.data;
    form.qwen_base_url = String(data.qwen_base_url || '');
    form.qwen_model = String(data.qwen_model || '');
    form.deepseek_base_url = String(data.deepseek_base_url || '');
    form.deepseek_model = String(data.deepseek_model || '');
    configSet.qwen_api_key__set = !!data.qwen_api_key__set;
    configSet.deepseek_api_key__set = !!data.deepseek_api_key__set;
    for (const m of menuItems) {
      (menuState as any)[m.key] = String((data as any)[m.key]) !== 'false';
    }
  } finally {
    loading.value = false;
  }
}

/** 保存 AI 配置：留空的 Key 不提交（保持原值） */
async function saveAiConfig() {
  savingAi.value = true;
  try {
    const payload: Record<string, string> = {
      qwen_base_url: form.qwen_base_url.trim(),
      qwen_model: form.qwen_model.trim(),
      deepseek_base_url: form.deepseek_base_url.trim(),
      deepseek_model: form.deepseek_model.trim(),
    };
    if (form.qwen_api_key.trim()) payload.qwen_api_key = form.qwen_api_key.trim();
    if (form.deepseek_api_key.trim()) payload.deepseek_api_key = form.deepseek_api_key.trim();
    await adminConfigApi.update(payload);
    ElMessage.success('AI 配置已保存');
    form.qwen_api_key = '';
    form.deepseek_api_key = '';
    await loadConfig();
  } finally {
    savingAi.value = false;
  }
}

/** 保存菜单开关，并刷新前端菜单可见性 */
async function saveMenuConfig() {
  savingMenu.value = true;
  try {
    await adminConfigApi.update({ ...menuState });
    ElMessage.success('菜单开关已保存，已实时生效');
    await configStore.fetchMenus();
  } finally {
    savingMenu.value = false;
  }
}
</script>

<style scoped>
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  margin: 4px 0 12px;
  font-size: 14px;
  color: #303133;
}

.menu-switch-list {
  display: flex;
  flex-direction: column;
}

.menu-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  border-bottom: 1px solid #f0f2f5;
  gap: 16px;
}

.menu-switch-item:last-child {
  border-bottom: none;
}

.menu-switch-name {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.menu-switch-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.save-bar {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
