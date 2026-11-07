<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">历史待办</div>
      <div class="page-desc">查看以前每天填写的今日待办清单及执行情况</div>
    </div>

    <el-card shadow="never" v-loading="loading">
      <div v-if="days.length" class="history-list">
        <div v-for="d in days" :key="d.todo_date" class="day-card">
          <div class="day-head" @click="toggleDetail(d.todo_date)">
            <span class="day-date">{{ d.todo_date }}</span>
            <el-tag
              :type="d.total > 0 && d.total === d.done ? 'success' : 'info'"
              size="small"
            >
              {{ d.done }}/{{ d.total }} 已完成
            </el-tag>
            <el-icon class="expand-icon" :class="{ expanded: expanded.has(d.todo_date) }">
              <ArrowDown />
            </el-icon>
          </div>

          <el-progress
            :percentage="d.total ? Math.round((d.done / d.total) * 100) : 0"
            :stroke-width="6"
            :status="d.total > 0 && d.total === d.done ? 'success' : undefined"
            :show-text="false"
            class="day-progress"
          />

          <div v-if="expanded.has(d.todo_date)" class="day-detail">
            <div v-if="(detail[d.todo_date] || []).length === 0" class="detail-empty">该日无待办</div>
            <div v-for="(t, i) in detail[d.todo_date] || []" :key="i" class="detail-item" :class="{ done: t.status === 'done' }">
              <span class="dot" :class="{ done: t.status === 'done' }"></span>
              <span class="detail-content">{{ t.content }}</span>
            </div>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无历史待办" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { todoApi, type TodoDaySummary, type TodoItem } from '../../api';

const days = ref<TodoDaySummary[]>([]);
const detail = ref<Record<string, TodoItem[]>>({});
const expanded = ref<Set<string>>(new Set());
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await todoApi.history(60);
    days.value = res.data || [];
  } finally {
    loading.value = false;
  }
}

async function toggleDetail(date: string) {
  if (expanded.value.has(date)) {
    expanded.value.delete(date);
    expanded.value = new Set(expanded.value);
    return;
  }
  expanded.value.add(date);
  expanded.value = new Set(expanded.value);
  if (!detail.value[date]) {
    const res = await todoApi.list(date);
    detail.value[date] = res.data || [];
  }
}

onMounted(load);
</script>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.day-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 12px 16px;
}

.day-head {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.day-date {
  font-weight: 600;
  font-size: 14px;
}

.expand-icon {
  margin-left: auto;
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.day-progress {
  margin-top: 10px;
}

.day-detail {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c0c4cc;
  flex-shrink: 0;
}

.dot.done {
  background: #67c23a;
}

.detail-content {
  word-break: break-all;
}

.detail-item.done .detail-content {
  text-decoration: line-through;
  color: #909399;
}

.detail-empty {
  color: #909399;
  font-size: 13px;
}
</style>