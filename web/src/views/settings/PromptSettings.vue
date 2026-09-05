<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">提示词配置</div>
      <div class="page-desc">自定义 AI 优化日志、生成报告、对话时的系统提示词，让 AI 更懂你的工作风格</div>
    </div>

    <el-row :gutter="16">
      <!-- 提示词列表 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>我的提示词</span>
              <el-button type="primary" size="small" @click="showCreate">
                <el-icon><Plus /></el-icon>新建
              </el-button>
            </div>
          </template>

          <el-tabs v-model="activeType" @tab-change="loadPrompts">
            <el-tab-pane label="日志优化" name="log_optimize" />
            <el-tab-pane label="报告生成" name="report" />
            <el-tab-pane label="AI 对话" name="chat" />
          </el-tabs>

          <!-- 系统默认提示词（只读，未自定义默认时生效） -->
          <div v-if="systemPrompt" class="prompt-item system-prompt" :class="{ active: selectedSystem }" @click="selectSystemPrompt">
            <div class="prompt-item-header">
              <span class="prompt-name">{{ systemPrompt.name }}</span>
              <el-tag :type="hasCustomDefault ? 'info' : 'success'" size="small">
                {{ hasCustomDefault ? '备用' : '当前生效' }}
              </el-tag>
            </div>
            <div class="prompt-preview">{{ systemPrompt.content.slice(0, 60) }}...</div>
          </div>

          <div class="list-section-title" v-if="prompts.length">我的提示词</div>

          <div v-if="prompts.length" class="prompt-list">
            <div
              v-for="p in prompts"
              :key="p.id"
              class="prompt-item"
              :class="{ active: selectedPrompt?.id === p.id }"
              @click="selectPrompt(p)"
            >
              <div class="prompt-item-header">
                <span class="prompt-name">{{ p.name }}</span>
                <el-tag v-if="p.is_default" type="primary" size="small">默认</el-tag>
              </div>
              <div class="prompt-preview">{{ p.content.slice(0, 60) }}...</div>
            </div>
          </div>
          <el-empty v-else description="暂无提示词，点击右上角新建" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 编辑区 -->
      <el-col :xs="24" :md="16">
        <el-card shadow="never">
          <template #header>
            <span>{{ editingPrompt ? '编辑提示词' : '提示词详情' }}</span>
          </template>

          <template v-if="selectedPrompt">
            <el-alert
              v-if="selectedSystem"
              type="info"
              :closable="false"
              show-icon
              title="系统默认提示词（只读）"
              description="未设置自定义默认提示词时使用。可新建自己的提示词并设为默认来覆盖。"
              style="margin-bottom: 16px"
            />
            <el-form label-position="top">
              <el-form-item label="提示词名称">
                <el-input v-model="selectedPrompt.name" :disabled="!editingPrompt || selectedSystem" maxlength="100" />
              </el-form-item>
              <el-form-item>
                <template #label>
                  <span>提示词内容</span>
                  <span class="label-tip">
                    （支持变量：{REPORT_TYPE} 会替换为周报/月报；AI 会在末尾附上日志数据）
                  </span>
                </template>
                <el-input
                  v-model="selectedPrompt.content"
                  type="textarea"
                  :rows="14"
                  :disabled="!editingPrompt || selectedSystem"
                  maxlength="5000"
                  show-word-limit
                />
              </el-form-item>
              <el-form-item v-if="editingPrompt">
                <el-checkbox v-model="selectedPrompt.is_default">设为该场景默认提示词</el-checkbox>
              </el-form-item>
            </el-form>

            <div class="edit-actions" v-if="!selectedSystem">
              <template v-if="!editingPrompt">
                <el-button type="primary" @click="editingPrompt = true">
                  <el-icon><Edit /></el-icon>编辑
                </el-button>
                <el-button type="danger" plain @click="handleDelete">
                  <el-icon><Delete /></el-icon>删除
                </el-button>
              </template>
              <template v-else>
                <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
                <el-button @click="cancelEdit">取消</el-button>
              </template>
            </div>
            <div class="edit-actions" v-else>
              <el-button type="primary" plain @click="copySystemPrompt">
                <el-icon><CopyDocument /></el-icon>复制内容
              </el-button>
            </div>
          </template>

          <el-empty v-else description="选择左侧提示词查看，或新建一个" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 新建对话框 -->
    <el-dialog v-model="createVisible" title="新建提示词" :width="isMobile ? '92%' : '560px'">
      <el-form label-position="top">
        <el-form-item label="适用场景">
          <el-select v-model="createForm.type" style="width: 100%">
            <el-option label="日志优化" value="log_optimize" />
            <el-option label="报告生成" value="report" />
            <el-option label="AI 对话" value="chat" />
          </el-select>
        </el-form-item>
        <el-form-item label="提示词名称">
          <el-input v-model="createForm.name" placeholder="例如：技术风日志优化" maxlength="100" />
        </el-form-item>
        <el-form-item label="提示词内容">
          <el-input
            v-model="createForm.content"
            type="textarea"
            :rows="8"
            placeholder="描述你希望 AI 如何处理你的内容..."
            maxlength="5000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="createForm.isDefault">设为该场景默认提示词</el-checkbox>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { promptApi } from '../../api';
import { useAppStore } from '../../stores/app';
import type { UserPrompt, SystemPrompt } from '../../types';

const appStore = useAppStore();
const isMobile = computed(() => appStore.isMobile);

const activeType = ref<'log_optimize' | 'report' | 'chat'>('log_optimize');
const prompts = ref<UserPrompt[]>([]);
const systemPrompt = ref<SystemPrompt | null>(null);
const hasCustomDefault = ref(false);
const selectedSystem = ref(false);
const selectedPrompt = ref<UserPrompt | null>(null);
const editingPrompt = ref(false);
const saving = ref(false);

const createVisible = ref(false);
const creating = ref(false);
const createForm = reactive({
  type: 'log_optimize',
  name: '',
  content: '',
  isDefault: false,
});

async function loadPrompts() {
  const res = await promptApi.list(activeType.value);
  prompts.value = res.data?.prompts || [];
  systemPrompt.value = res.data?.systemPrompts?.[0] || null;
  hasCustomDefault.value = !!res.data?.hasCustomDefault;
  if (selectedSystem.value) {
    // 保持选中系统提示词
    selectedPrompt.value = systemPrompt.value ? { ...systemPrompt.value, user_id: 0, is_default: false, created_at: '', updated_at: '' } as any : null;
  } else if (selectedPrompt.value && !prompts.value.find((p) => p.id === selectedPrompt.value!.id)) {
    selectedPrompt.value = null;
    editingPrompt.value = false;
  }
}

function selectPrompt(p: UserPrompt) {
  selectedSystem.value = false;
  selectedPrompt.value = { ...p };
  editingPrompt.value = false;
}

function selectSystemPrompt() {
  if (!systemPrompt.value) return;
  selectedSystem.value = true;
  editingPrompt.value = false;
  selectedPrompt.value = { ...systemPrompt.value, user_id: 0, is_default: false, created_at: '', updated_at: '' } as any;
}

async function copySystemPrompt() {
  if (!selectedPrompt.value) return;
  try {
    await navigator.clipboard.writeText(selectedPrompt.value.content);
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.error('复制失败');
  }
}

function cancelEdit() {
  // 还原
  const original = prompts.value.find((p) => p.id === selectedPrompt.value?.id);
  if (original) {
    selectedPrompt.value = { ...original };
  }
  editingPrompt.value = false;
}

function showCreate() {
  createForm.type = activeType.value;
  createForm.name = '';
  createForm.content = '';
  createForm.isDefault = false;
  createVisible.value = true;
}

async function handleCreate() {
  if (!createForm.name.trim() || !createForm.content.trim()) {
    ElMessage.warning('请填写提示词名称和内容');
    return;
  }
  creating.value = true;
  try {
    await promptApi.create({
      type: createForm.type,
      name: createForm.name,
      content: createForm.content,
      isDefault: createForm.isDefault,
    });
    ElMessage.success('提示词创建成功');
    createVisible.value = false;
    activeType.value = createForm.type as any;
    loadPrompts();
  } finally {
    creating.value = false;
  }
}

async function handleSave() {
  if (!selectedPrompt.value) return;
  if (!selectedPrompt.value.name.trim() || !selectedPrompt.value.content.trim()) {
    ElMessage.warning('提示词名称和内容不能为空');
    return;
  }
  saving.value = true;
  try {
    await promptApi.update(selectedPrompt.value.id, {
      name: selectedPrompt.value.name,
      content: selectedPrompt.value.content,
      isDefault: selectedPrompt.value.is_default,
    });
    ElMessage.success('保存成功');
    editingPrompt.value = false;
    loadPrompts();
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!selectedPrompt.value) return;
  await ElMessageBox.confirm(`确定删除提示词「${selectedPrompt.value.name}」吗？`, '提示', {
    type: 'warning',
  });
  await promptApi.remove(selectedPrompt.value.id);
  ElMessage.success('删除成功');
  selectedPrompt.value = null;
  loadPrompts();
}

onMounted(loadPrompts);
</script>

<style scoped>
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list-section-title {
  font-size: 12px;
  color: #909399;
  margin: 12px 0 8px;
}

.system-prompt {
  background: #fafcff;
  border-style: dashed;
}

.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.prompt-item:hover {
  border-color: #c6e2ff;
}

.prompt-item.active {
  border-color: #409eff;
  background: #ecf5ff;
}

.prompt-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.prompt-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.prompt-preview {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label-tip {
  font-size: 12px;
  color: #c0c4cc;
  font-weight: normal;
}

.edit-actions {
  display: flex;
  gap: 10px;
}
</style>
