<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">系统设置</div>
      <div class="page-desc">配置系统级 AI 服务（用户未配置自己的 Key 时使用）与角色菜单可见性</div>
    </div>

    <el-row :gutter="16">
      <!-- AI 服务配置 -->
      <el-col :xs="24" :md="24">
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
    </el-row>

    <!-- ==================== 角色菜单可见性 ==================== -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="24">
        <el-card shadow="never" v-loading="loadingRoleMenus">
          <template #header>
            <div class="card-header-row">
              <span>角色菜单可见性</span>
              <el-tag size="small" type="info">按角色控制各菜单是否可见</el-tag>
            </div>
          </template>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="未配置的角色默认全部菜单可见；用户管理/系统设置仅项目总监与系统管理员可见，不在此配置"
            style="margin-bottom: 16px"
          />

          <el-table v-if="!isMobile" :data="roleMenuRows" border size="small">
            <el-table-column prop="label" label="菜单" width="130" fixed="left" />
            <el-table-column
              v-for="r in ROLE_OPTIONS"
              :key="r.value"
              :label="r.label"
              min-width="110"
              align="center"
            >
              <template #default="{ row }">
                <el-switch v-model="roleMenus[r.value][row.key]" />
              </template>
            </el-table-column>
          </el-table>

          <!-- 移动端：逐角色折叠配置 -->
          <el-collapse v-else v-model="activeRolePanel">
            <el-collapse-item v-for="r in ROLE_OPTIONS" :key="r.value" :title="r.label" :name="r.value">
              <div v-for="m in ROLE_MENU_ITEMS" :key="m.key" class="menu-switch-item">
                <div class="menu-switch-info">
                  <div class="menu-switch-name">{{ m.label }}</div>
                </div>
                <el-switch v-model="roleMenus[r.value][m.key]" />
              </div>
            </el-collapse-item>
          </el-collapse>

          <div class="save-bar">
            <el-button type="primary" :loading="savingRoleMenus" @click="saveRoleMenus">保存角色菜单配置</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ==================== 版本管理 ==================== -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>发布新版本</span>
              <el-tag size="small" type="info">发布后自动向所有用户收件箱发送通知</el-tag>
            </div>
          </template>
          <el-form label-position="top" v-loading="releasing">
            <el-form-item label="版本号" required>
              <el-input v-model="versionForm.version" placeholder="如 1.1.0" maxlength="20" />
            </el-form-item>
            <el-form-item label="版本标题" required>
              <el-input v-model="versionForm.title" placeholder="如 新增审批与反馈功能" maxlength="100" />
            </el-form-item>
            <el-form-item label="更新说明（Markdown）" required>
              <el-input
                v-model="versionForm.description"
                type="textarea"
                :rows="6"
                placeholder="1. xxx&#10;2. xxx&#10;3. xxx"
                maxlength="2000"
                show-word-limit
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="releasing" @click="releaseVersion">发布版本</el-button>
            </el-form-item>
          </el-form>

          <h4 class="section-title">版本历史</h4>
          <el-timeline v-if="versions.length" class="version-timeline">
            <el-timeline-item
              v-for="v in versions"
              :key="v.id"
              :timestamp="formatTime(v.released_at)"
              placement="top"
            >
              <div class="version-item-row">
                <div class="version-item-info">
                  <div class="version-title">v{{ v.version }} {{ v.title }}</div>
                  <div class="version-desc">{{ v.description }}</div>
                </div>
                <el-button link type="danger" size="small" @click="removeVersion(v)">删除</el-button>
              </div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无版本记录" :image-size="60" />
        </el-card>
      </el-col>

      <!-- ==================== 反馈管理 ==================== -->
      <el-col :xs="24" :md="14">
        <el-card shadow="never" v-loading="fbLoading">
          <template #header>
            <div class="card-header-row">
              <span>用户反馈</span>
              <el-radio-group v-model="fbFilter" size="small" @change="loadFeedback">
                <el-radio-button value="">全部</el-radio-button>
                <el-radio-button value="pending">待处理</el-radio-button>
                <el-radio-button value="processed">已处理</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div v-if="feedbackList.length" class="fb-list">
            <div v-for="f in feedbackList" :key="f.id" class="fb-item">
              <div class="fb-top">
                <span class="fb-user">{{ f.user_name }}（{{ f.username }}）</span>
                <el-tag :type="f.status === 'processed' ? 'success' : 'warning'" size="small">
                  {{ f.status === 'processed' ? '已处理' : '待处理' }}
                </el-tag>
                <span class="fb-time">{{ formatTime(f.created_at) }}</span>
              </div>
              <div class="fb-content">{{ f.content }}</div>
              <div v-if="f.contact" class="fb-contact">联系方式：{{ f.contact }}</div>
              <div class="fb-reply-area">
                <el-input
                  v-model="replyDraft[f.id]"
                  type="textarea"
                  :rows="2"
                  :placeholder="f.admin_reply ? `当前回复：${f.admin_reply}` : '回复用户（回复后会通知对方）'"
                />
                <div class="fb-reply-actions">
                  <el-button size="small" type="primary" @click="replyFeedback(f)">回复并标记已处理</el-button>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无反馈" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminConfigApi, versionApi, feedbackApi, type AppVersion, type Feedback } from '../../api';
import { useConfigStore } from '../../stores/config';
import { useAppStore } from '../../stores/app';

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

// ==================== 版本管理 ====================
const releasing = ref(false);
const versions = ref<AppVersion[]>([]);
const versionForm = reactive({ version: '', title: '', description: '' });

async function loadVersions() {
  const res = await versionApi.adminList();
  versions.value = res.data || [];
}

async function releaseVersion() {
  if (!versionForm.version.trim() || !versionForm.title.trim() || !versionForm.description.trim()) {
    ElMessage.warning('版本号、标题和更新说明均为必填');
    return;
  }
  releasing.value = true;
  try {
    await versionApi.release({
      version: versionForm.version.trim(),
      title: versionForm.title.trim(),
      description: versionForm.description.trim(),
    });
    ElMessage.success('版本已发布，已向所有用户收件箱发送通知');
    versionForm.version = '';
    versionForm.title = '';
    versionForm.description = '';
    loadVersions();
  } finally {
    releasing.value = false;
  }
}

async function removeVersion(v: AppVersion) {
  await ElMessageBox.confirm(`确定删除版本 v${v.version} 的记录吗？`, '提示', { type: 'warning' });
  await versionApi.remove(v.id);
  ElMessage.success('已删除');
  loadVersions();
}

// ==================== 反馈管理 ====================
const feedbackList = ref<Feedback[]>([]);
const fbFilter = ref('');
const fbLoading = ref(false);
const replyDraft = reactive<Record<number, string>>({});

async function loadFeedback() {
  fbLoading.value = true;
  try {
    const res = await feedbackApi.adminList(fbFilter.value ? { status: fbFilter.value } : undefined);
    feedbackList.value = res.data || [];
  } finally {
    fbLoading.value = false;
  }
}

async function replyFeedback(f: Feedback) {
  const reply = (replyDraft[f.id] || '').trim();
  if (!reply) {
    ElMessage.warning('请先填写回复内容');
    return;
  }
  await feedbackApi.adminReply(f.id, { adminReply: reply, status: 'processed' });
  ElMessage.success('已回复并标记为已处理');
  replyDraft[f.id] = '';
  loadFeedback();
}

const configStore = useConfigStore();

const loading = ref(false);
const savingAi = ref(false);

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

// ==================== 角色菜单可见性 ====================
const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

/** 可配置的角色 */
const ROLE_OPTIONS = [
  { value: 'director', label: '项目总监' },
  { value: 'admin', label: '系统管理员' },
  { value: 'manager', label: '项目经理' },
  { value: 'leader', label: '小组长' },
  { value: 'member', label: '成员' },
] as const;

/** 可按角色配置的菜单（用户管理/系统设置为系统管理员专属，不在此列） */
const ROLE_MENU_ITEMS = [
  { key: 'dashboard', label: '工作台' },
  { key: 'logsWrite', label: '填写日志' },
  { key: 'logs', label: '我的日志' },
  { key: 'logsAll', label: '团队日志' },
  { key: 'projects', label: '项目管理' },
  { key: 'reports', label: '报告中心' },
  { key: 'chat', label: 'AI 助手' },
  { key: 'inbox', label: '收件箱' },
  { key: 'approvals', label: '审批中心' },
  { key: 'feedback', label: '意见反馈' },
  { key: 'prompts', label: '提示词配置' },
] as const;

/** 角色 × 菜单 开关矩阵（本地编辑态，默认全部可见） */
function buildDefaultRoleMenus(): Record<string, Record<string, boolean>> {
  const m: Record<string, Record<string, boolean>> = {};
  for (const r of ROLE_OPTIONS) {
    m[r.value] = {};
    for (const item of ROLE_MENU_ITEMS) m[r.value][item.key] = true;
  }
  return m;
}

const roleMenus = reactive(buildDefaultRoleMenus());
const roleMenuRows = ROLE_MENU_ITEMS.map((m) => ({ ...m }));
const loadingRoleMenus = ref(false);
const savingRoleMenus = ref(false);
const activeRolePanel = ref<string[]>(['director']);

/** 加载服务端 role_menus 配置（JSON 字符串），未配置的项保持默认可见 */
function applyRoleMenus(raw?: string) {
  const def = buildDefaultRoleMenus();
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      for (const r of ROLE_OPTIONS) {
        if (parsed[r.value] && typeof parsed[r.value] === 'object') {
          for (const item of ROLE_MENU_ITEMS) {
            if (typeof parsed[r.value][item.key] === 'boolean') {
              def[r.value][item.key] = parsed[r.value][item.key];
            }
          }
        }
      }
    }
  } catch {
    // 配置损坏时按默认处理
  }
  for (const r of ROLE_OPTIONS) {
    for (const item of ROLE_MENU_ITEMS) roleMenus[r.value][item.key] = def[r.value][item.key];
  }
}

async function saveRoleMenus() {
  savingRoleMenus.value = true;
  try {
    await adminConfigApi.update({ role_menus: JSON.stringify(roleMenus) });
    ElMessage.success('角色菜单配置已保存，已实时生效');
    await configStore.fetchMenus();
  } finally {
    savingRoleMenus.value = false;
  }
}

onMounted(() => {
  loadConfig();
  loadVersions();
  loadFeedback();
});

async function loadConfig() {
  loading.value = true;
  loadingRoleMenus.value = true;
  try {
    const res = await adminConfigApi.get();
    const data = res.data;
    form.qwen_base_url = String(data.qwen_base_url || '');
    form.qwen_model = String(data.qwen_model || '');
    form.deepseek_base_url = String(data.deepseek_base_url || '');
    form.deepseek_model = String(data.deepseek_model || '');
    configSet.qwen_api_key__set = !!data.qwen_api_key__set;
    configSet.deepseek_api_key__set = !!data.deepseek_api_key__set;
    applyRoleMenus(String((data as any).role_menus || ''));
  } finally {
    loading.value = false;
    loadingRoleMenus.value = false;
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

.save-bar {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 版本管理 */
.version-timeline {
  margin-top: 8px;
}

.version-item-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.version-item-info {
  flex: 1;
  min-width: 0;
}

.version-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.version-desc {
  font-size: 13px;
  color: #606266;
  margin-top: 4px;
  white-space: pre-wrap;
}

/* 反馈管理 */
.fb-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fb-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
}

.fb-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fb-user {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.fb-time {
  margin-left: auto;
  font-size: 12px;
  color: #c0c4cc;
}

.fb-content {
  font-size: 13px;
  color: #303133;
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.fb-contact {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
}

.fb-reply-area {
  margin-top: 10px;
}

.fb-reply-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
</style>
