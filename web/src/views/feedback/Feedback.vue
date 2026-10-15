<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">意见反馈</div>
      <div class="page-desc">告诉我们您在使用中遇到的问题或建议</div>
    </div>

    <el-row :gutter="16">
      <!-- 提交反馈 -->
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header><span>提交反馈</span></template>
          <el-form label-position="top" v-loading="submitting">
            <el-form-item label="反馈内容" required>
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="6"
                placeholder="请描述您遇到的问题或改进建议（最多 2000 字）"
                maxlength="2000"
                show-word-limit
              />
            </el-form-item>
            <el-form-item label="联系方式（可选）">
              <el-input v-model="form.contact" placeholder="邮箱 / 微信 / 手机号，便于我们回复您" maxlength="100" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="submit">提交反馈</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 版本更新历史 -->
        <el-card shadow="never" class="version-card">
          <template #header><span>版本更新</span></template>
          <el-timeline v-if="versions.length">
            <el-timeline-item
              v-for="v in versions"
              :key="v.id"
              :timestamp="formatTime(v.released_at)"
              placement="top"
            >
              <div class="version-title">v{{ v.version }} {{ v.title }}</div>
              <div class="version-desc">{{ v.description }}</div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无版本记录" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 我的反馈 -->
      <el-col :xs="24" :md="14">
        <el-card shadow="never" v-loading="loading">
          <template #header>
            <div class="list-header">
              <span>我的反馈</span>
              <el-tag v-if="userStore.isDirector" size="small">您可在「系统设置 → 反馈管理」中处理用户反馈</el-tag>
            </div>
          </template>
          <div v-if="myFeedback.length" class="feedback-list">
            <div v-for="f in myFeedback" :key="f.id" class="feedback-item item-card">
              <div class="feedback-top">
                <el-tag :type="f.status === 'processed' ? 'success' : 'warning'" size="small">
                  {{ f.status === 'processed' ? '已处理' : '待处理' }}
                </el-tag>
                <span class="feedback-time">{{ formatTime(f.created_at) }}</span>
              </div>
              <div class="feedback-content">{{ f.content }}</div>
              <div v-if="f.contact" class="feedback-contact">联系方式：{{ f.contact }}</div>
              <div v-if="f.admin_reply" class="feedback-reply">
                <div class="reply-label">管理员回复：</div>
                <div>{{ f.admin_reply }}</div>
              </div>
            </div>
          </div>
          <el-empty v-else description="您还没有提交过反馈" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { feedbackApi, versionApi, type Feedback, type AppVersion } from '../../api';
import { useUserStore } from '../../stores/user';

const userStore = useUserStore();
const myFeedback = ref<Feedback[]>([]);
const versions = ref<AppVersion[]>([]);
const loading = ref(false);
const submitting = ref(false);
const form = reactive({ content: '', contact: '' });

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

async function loadData() {
  loading.value = true;
  try {
    const [fbRes, vRes] = await Promise.all([feedbackApi.mine(), versionApi.list()]);
    myFeedback.value = fbRes.data || [];
    versions.value = vRes.data || [];
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!form.content.trim()) {
    ElMessage.warning('请填写反馈内容');
    return;
  }
  submitting.value = true;
  try {
    await feedbackApi.create({ content: form.content.trim(), contact: form.contact.trim() || undefined });
    ElMessage.success('反馈已提交，感谢您的意见！');
    form.content = '';
    form.contact = '';
    loadData();
  } finally {
    submitting.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped>
.version-card {
  margin-top: 16px;
}

.version-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.version-desc {
  font-size: 13px;
  color: var(--text-regular);
  margin-top: 4px;
  white-space: pre-wrap;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.feedback-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feedback-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.feedback-time {
  font-size: 12px;
  color: var(--text-placeholder);
}

.feedback-content {
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.feedback-contact {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.feedback-reply {
  margin-top: 10px;
  background: #f0f9eb;
  border-radius: var(--radius-base);
  padding: 10px;
  font-size: 13px;
  color: var(--text-primary);
}

.reply-label {
  font-weight: 600;
  color: var(--success-color);
  margin-bottom: 4px;
}
</style>
