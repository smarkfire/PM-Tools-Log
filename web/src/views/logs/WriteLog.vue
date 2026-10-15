<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">{{ isEdit ? `编辑日志（${form.logDate}）` : '填写日志' }}</div>
      <div class="page-desc">
        {{ isEdit
          ? '修改已有日志并保存；超过本周的修改需上级审批通过后才可提交'
          : '可填写本周任意一天的工作日志，支持通义千问 / DeepSeek AI 优化' }}
      </div>
    </div>

    <el-row :gutter="16">
      <!-- 编辑区 -->
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">日志内容</span>
          </template>
          <el-form label-position="top">
            <el-row :gutter="12">
              <el-col :xs="24" :sm="12">
                <el-form-item label="日志日期">
                  <el-date-picker
                    v-model="form.logDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="选择日期"
                    :disabled="isEdit"
                    :disabled-date="disableOutOfRangeDate"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="所属项目" required>
                  <el-select
                    v-model="form.projectId"
                    placeholder="请选择项目（必填）"
                    :clearable="false"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="p in projects"
                      :key="p.id"
                      :label="p.name"
                      :value="p.id"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="工作时长（小时）">
                  <el-input-number
                    v-model="form.hours"
                    :min="0"
                    :max="24"
                    :step="0.5"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col v-if="form.projectId && projectGroups.length" :span="24">
                <el-form-item label="涉及小组（可多选，工时按组分配）">
                  <el-select
                    v-model="groupSelection"
                    multiple
                    collapse-tags
                    collapse-tags-tooltip
                    clearable
                    placeholder="选择本篇日志涉及的小组（可选）"
                    style="width: 100%"
                  >
                    <el-option v-for="g in projectGroups" :key="g.id" :label="g.name" :value="g.id" />
                  </el-select>
                  <div v-if="groupSelection.length" class="group-hours-list">
                    <div v-for="gid in groupSelection" :key="gid" class="group-hours-row">
                      <span class="group-hours-name">{{ groupNameOf(gid) }}</span>
                      <el-input-number
                        v-model="groupHoursMap[gid]"
                        :min="0"
                        :max="24"
                        :step="0.5"
                        size="small"
                        controls-position="right"
                      />
                      <span class="group-hours-unit">h</span>
                    </div>
                    <div class="group-hours-tip">默认按总工时均摊到各组，可按实际投入修改</div>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item label="今日工作内容（可直接写流水账，稍后用 AI 优化）">
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="10"
                placeholder="示例：&#10;1. 上午开了需求评审会，确定了V2.0的三个核心功能&#10;2. 下午写完了用户模块的接口，自测通过&#10;3. 帮小王看了个线上bug，是空指针导致的"
                maxlength="10000"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- AI 优化区 -->
      <el-col :xs="24" :md="10">
        <el-card shadow="never" class="optimize-card">
          <template #header>
            <div class="optimize-header">
              <span class="card-title">AI 优化</span>
              <el-tag v-if="optimizedContent" :type="form.aiProvider === 'qwen' ? 'primary' : 'success'" size="small">
                {{ form.aiProvider === 'qwen' ? '通义千问' : 'DeepSeek' }}
              </el-tag>
            </div>
          </template>

          <!-- AI 设置 -->
          <div class="ai-settings">
            <el-radio-group v-model="aiProvider" size="small">
              <el-radio-button value="qwen" :disabled="!providers.qwenConfigured">
                通义千问
              </el-radio-button>
              <el-radio-button value="deepseek" :disabled="!providers.deepseekConfigured">
                DeepSeek
              </el-radio-button>
            </el-radio-group>

            <el-select
              v-model="selectedPromptId"
              placeholder="选择自定义提示词（可选）"
              clearable
              size="small"
              style="width: 100%; margin-top: 10px"
            >
              <el-option
                v-for="p in prompts"
                :key="p.id"
                :label="p.name + (p.is_default ? '（默认）' : '')"
                :value="p.id"
              />
            </el-select>
          </div>

          <el-alert
            v-if="!providers.qwenConfigured && !providers.deepseekConfigured"
            type="warning"
            :closable="false"
            title="AI 未配置"
            description="服务端未配置 AI API Key，请联系管理员在 server/.env 中配置 QWEN_API_KEY 或 DEEPSEEK_API_KEY"
            class="ai-warning"
          />

          <el-button
            type="primary"
            class="optimize-btn"
            :loading="optimizing"
            :disabled="!form.content?.trim() || (!providers.qwenConfigured && !providers.deepseekConfigured)"
            @click="handleOptimize"
          >
            <el-icon><MagicStick /></el-icon>
            {{ optimizing ? 'AI 正在优化中...' : 'AI 优化日志' }}
          </el-button>

          <!-- 优化结果 -->
          <div v-if="optimizedContent" class="optimize-result">
            <div class="result-header">
              <span>优化结果（可直接编辑）</span>
              <el-button link type="primary" size="small" @click="copyOptimized">
                <el-icon><CopyDocument /></el-icon>复制
              </el-button>
            </div>
            <el-input
              v-model="optimizedContent"
              type="textarea"
              :rows="12"
              class="result-textarea"
            />
          </div>
        </el-card>

        <el-card shadow="never" class="save-card">
          <el-button
            type="success"
            size="large"
            style="width: 100%"
            :loading="saving"
            :disabled="!form.content?.trim() || !form.projectId"
            @click="handleSave"
          >
            <el-icon><Check /></el-icon>
            保存日志
          </el-button>
          <div class="save-tip">
            保存时将同时提交原始内容与优化后内容
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { logApi, projectApi, promptApi, chatApi } from '../../api';
import { useUserStore } from '../../stores/user';
import { currentWeekMonday, formatDate } from '../../utils/date';
import type { Project, UserPrompt } from '../../types';

const userStore = useUserStore();
const projects = ref<Project[]>([]);
const prompts = ref<UserPrompt[]>([]);

const providers = reactive({ qwenConfigured: false, deepseekConfigured: false });
const aiProvider = ref<'qwen' | 'deepseek'>('qwen');
const selectedPromptId = ref<number | undefined>(undefined);

const today = formatDate(new Date());
const route = useRoute();
const router = useRouter();

// 编辑模式：?date=YYYY-MM-DD 时加载当天已有日志
const editDate = computed(() => (route.query.date as string) || '');
const isEdit = computed(() => !!editDate.value);

// 可填写日期范围：本周一 ~ 今天（编辑模式日期锁定为原日志日期）
const weekMonday = currentWeekMonday();
function disableOutOfRangeDate(d: Date): boolean {
  const monday = new Date(weekMonday + 'T00:00:00');
  return d < monday || d.getTime() > Date.now();
}

const form = reactive({
  logDate: editDate.value || today,
  projectId: undefined as number | undefined,
  hours: 8,
  content: '',
  aiProvider: '' as string,
});

const optimizedContent = ref('');
const optimizing = ref(false);
const saving = ref(false);

// ===== 跨组协作：涉及小组多选 + 各组投入工时 =====
const groupSelection = ref<number[]>([]);
const groupHoursMap = reactive<Record<number, number | undefined>>({});

// 当前所选项目下的小组（需为项目成员才可标记，由后端校验）
const projectGroups = computed(() => {
  const p = projects.value.find((item) => item.id === form.projectId);
  return p?.groups || [];
});

function groupNameOf(gid: number): string {
  return projectGroups.value.find((g) => g.id === gid)?.name || `小组#${gid}`;
}

// 切换项目时清空小组选择
watch(
  () => form.projectId,
  () => {
    groupSelection.value = [];
    Object.keys(groupHoursMap).forEach((k) => delete groupHoursMap[Number(k)]);
  }
);

// 新增勾选小组时按总工时均摊预填（已有的不覆盖，可手动修改）
watch(groupSelection, (ids) => {
  const n = ids.length;
  if (!n) return;
  const even = form.hours != null ? Math.round((form.hours / n) * 10) / 10 : undefined;
  ids.forEach((id) => {
    if (groupHoursMap[id] == null) groupHoursMap[id] = even;
  });
});

onMounted(async () => {
  const [projectRes, promptRes, providerRes] = await Promise.all([
    projectApi.list(),
    promptApi.list('log_optimize'),
    chatApi.providers(),
  ]);
  projects.value = projectRes.data || [];
  prompts.value = promptRes.data?.prompts || [];
  providers.qwenConfigured = providerRes.data.qwenConfigured;
  providers.deepseekConfigured = providerRes.data.deepseekConfigured;
  if (!providers.qwenConfigured && providers.deepseekConfigured) {
    aiProvider.value = 'deepseek';
  }

  // 编辑模式：加载已有日志内容
  if (isEdit.value) {
    const res = await logApi.list({
      userId: userStore.user?.id,
      startDate: editDate.value,
      endDate: editDate.value,
      page: 1,
      pageSize: 1,
    });
    const existing = res.data.list?.[0];
    if (existing) {
      form.logDate = existing.log_date;
      form.projectId = existing.project_id || undefined;
      form.hours = existing.hours ?? 8;
      form.content = existing.content;
      form.aiProvider = existing.ai_provider || '';
      optimizedContent.value = existing.optimized_content || '';
      // 回填已标记的小组与各组工时
      // nextTick：等 projectId 变化的 watcher（清空小组选择）先执行完毕
      if (existing.group_marks?.length) {
        nextTick(() => {
          groupSelection.value = existing.group_marks!.map((m) => m.groupId);
          existing.group_marks!.forEach((m) => {
            groupHoursMap[m.groupId] = m.hours ?? undefined;
          });
        });
      }
    }
  }
});

async function handleOptimize() {
  if (!form.content?.trim()) {
    ElMessage.warning('请先填写日志内容');
    return;
  }
  optimizing.value = true;
  try {
    const res = await logApi.optimize({
      content: form.content,
      provider: aiProvider.value,
      promptId: selectedPromptId.value,
    });
    optimizedContent.value = res.data.optimizedContent;
    form.aiProvider = res.data.provider;
    ElMessage.success('AI 优化完成');
  } finally {
    optimizing.value = false;
  }
}

async function copyOptimized() {
  try {
    await navigator.clipboard.writeText(optimizedContent.value);
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.warning('复制失败，请手动选择复制');
  }
}

async function handleSave() {
  if (!form.projectId) {
    ElMessage.warning('请选择所属项目');
    return;
  }
  if (!form.logDate) {
    ElMessage.warning('请选择日志日期');
    return;
  }
  saving.value = true;
  try {
    await logApi.save({
      logDate: form.logDate,
      projectId: form.projectId,
      content: form.content,
      optimizedContent: optimizedContent.value || undefined,
      aiProvider: form.aiProvider || undefined,
      hours: form.hours,
      groups: groupSelection.value.map((gid) => ({
        groupId: gid,
        hours: groupHoursMap[gid] ?? null,
      })),
    });
    ElMessage.success('日志保存成功');
    if (isEdit.value) {
      // 编辑模式：保存后返回日志列表
      router.push('/logs');
      return;
    }
    form.content = '';
    optimizedContent.value = '';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.card-title {
  font-weight: 600;
}

.optimize-card {
  margin-bottom: 16px;
}

.optimize-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-settings {
  margin-bottom: 14px;
}

.ai-warning {
  margin-bottom: 12px;
}

.optimize-btn {
  width: 100%;
  margin-bottom: 14px;
}

.optimize-result {
  border-top: 1px dashed #e4e7ed;
  padding-top: 12px;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.result-textarea :deep(.el-textarea__inner) {
  line-height: 1.7;
}

.save-card .save-tip {
  font-size: 12px;
  color: #909399;
  text-align: center;
  margin-top: 8px;
}

/* 跨组协作：各小组工时分配 */
.group-hours-list {
  width: 100%;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.group-hours-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.group-hours-name {
  flex: 1;
  font-size: 13px;
}

.group-hours-unit {
  font-size: 13px;
  color: #909399;
}

.group-hours-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
