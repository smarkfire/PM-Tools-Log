<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">审批中心</div>
      <div class="page-desc">
        下属提交的日志/报告修改申请需在此审批；本周内的日志/报告可直接修改，无需审批
      </div>
    </div>

    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <!-- 待我审批 -->
        <el-tab-pane label="待我审批" name="pending">
          <div v-if="pendingList.length" class="approval-list" v-loading="pendingLoading">
            <div v-for="a in pendingList" :key="a.id" class="approval-item item-card">
              <div class="approval-top">
                <el-tag :type="a.target_type === 'log' ? 'primary' : 'warning'" size="small">
                  {{ a.target_type === 'log' ? '日志修改' : '报告修改' }}
                </el-tag>
                <span class="applicant">{{ a.user_name }}</span>
                <el-tag type="info" size="small" effect="light">{{ statusLabel(a.status) }}</el-tag>
                <span class="approval-time">{{ formatTime(a.created_at) }}</span>
              </div>
              <div class="approval-target">{{ a.target_summary }}</div>
              <div class="approval-reason">
                <span class="reason-label">修改原因：</span>{{ a.reason }}
              </div>
              <div class="approval-actions">
                <el-button type="success" size="small" @click="handleApprove(a, true)">通过</el-button>
                <el-button type="danger" size="small" plain @click="handleApprove(a, false)">拒绝</el-button>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无待审批的申请" />
        </el-tab-pane>

        <!-- 我的申请 -->
        <el-tab-pane :label="`我的申请${myList.length ? '' : ''}`" name="mine">
          <div v-if="myList.length" class="approval-list" v-loading="myLoading">
            <div v-for="a in myList" :key="a.id" class="approval-item item-card">
              <div class="approval-top">
                <el-tag :type="a.target_type === 'log' ? 'primary' : 'warning'" size="small">
                  {{ a.target_type === 'log' ? '日志修改' : '报告修改' }}
                </el-tag>
                <el-tag :type="statusTagType(a.status)" size="small">{{ statusLabel(a.status) }}</el-tag>
                <span class="approval-time">{{ formatTime(a.created_at) }}</span>
              </div>
              <div class="approval-target">{{ a.target_summary }}</div>
              <div class="approval-reason">
                <span class="reason-label">修改原因：</span>{{ a.reason }}
              </div>
              <div v-if="a.approve_note" class="approval-note">
                审批意见：{{ a.approve_note }}
              </div>
              <div v-if="a.status === 'approved'" class="approval-tip">
                申请已通过，可前往对应日志/报告进行修改（仅可修改一次）
              </div>
              <div v-else-if="a.status === 'rejected'" class="approval-tip rejected">
                申请被拒绝，如有疑问请联系审批人
              </div>
            </div>
          </div>
          <el-empty v-else description="您没有提交过修改申请；超过本周的日志/报告在编辑时会自动引导提交申请" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { approvalApi, type EditApproval } from '../../api';

const activeTab = ref('pending');
const pendingList = ref<EditApproval[]>([]);
const pendingLoading = ref(false);
const myList = ref<EditApproval[]>([]);
const myLoading = ref(false);

function formatTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已拒绝',
    used: '已使用',
  };
  return map[status] || status;
}

function statusTagType(status: string) {
  const map: Record<string, string> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    used: 'info',
  };
  return map[status] || 'info';
}

async function loadPending() {
  pendingLoading.value = true;
  try {
    const res = await approvalApi.pending();
    pendingList.value = res.data || [];
  } finally {
    pendingLoading.value = false;
  }
}

async function loadMine() {
  myLoading.value = true;
  try {
    const res = await approvalApi.mine();
    myList.value = res.data || [];
  } finally {
    myLoading.value = false;
  }
}

async function handleApprove(a: EditApproval, approved: boolean) {
  let note = '';
  if (!approved) {
    const { value } = await ElMessageBox.prompt('请填写拒绝原因（可选）', '拒绝申请', {
      inputPlaceholder: '拒绝原因',
      inputValue: '',
    }).catch(() => ({ value: undefined as undefined | string }));
    if (value === undefined) return; // 取消
    note = value;
  } else {
    await ElMessageBox.confirm(
      `确认通过 ${a.user_name} 的修改申请吗？通过后对方可修改一次。`,
      '通过申请',
      { type: 'info' }
    );
  }
  await approvalApi.handle(a.id, { approved, note: note || undefined });
  ElMessage.success(approved ? '已通过' : '已拒绝');
  loadPending();
}

onMounted(() => {
  loadPending();
  loadMine();
});
</script>

<style scoped>
.approval-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.approval-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.applicant {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.approval-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-placeholder);
}

.approval-target {
  font-size: 13px;
  color: var(--text-regular);
  margin-top: 8px;
}

.approval-reason {
  font-size: 13px;
  color: var(--text-primary);
  margin-top: 6px;
  white-space: pre-wrap;
}

.reason-label {
  color: var(--text-secondary);
}

.approval-note {
  margin-top: 6px;
  font-size: 13px;
  color: var(--success-color);
}

.approval-tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--primary-color);
}

.approval-tip.rejected {
  color: var(--danger-color);
}

.approval-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
</style>
