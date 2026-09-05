<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">工作台</div>
      <div class="page-desc">
        {{ greeting }}，{{ userStore.user?.displayName }}（{{ userStore.roleLabel }}）
      </div>
    </div>

    <!-- 统计卡片（响应式栅格） -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #ecf5ff">
              <el-icon :size="24" color="#409eff"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total }}</div>
              <div class="stat-label">日志总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #f0f9eb">
              <el-icon :size="24" color="#67c23a"><Calendar /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.today }}</div>
              <div class="stat-label">今日已填</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #fdf6ec">
              <el-icon :size="24" color="#e6a23c"><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.activeUsers }}</div>
              <div class="stat-label">活跃成员</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <div class="stat-icon" style="background: #f4ecfd">
              <el-icon :size="24" color="#9b59e6"><Folder /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ projects.length }}</div>
              <div class="stat-label">参与项目</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 快捷操作 -->
    <el-row :gutter="16" class="action-row">
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="action-card" @click="$router.push('/logs/write')">
          <el-icon :size="28" color="#409eff"><EditPen /></el-icon>
          <div class="action-text">
            <div class="action-title">填写日志</div>
            <div class="action-desc">记录今天的工作，可用 AI 优化</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="action-card" @click="$router.push('/reports')">
          <el-icon :size="28" color="#67c23a"><DataAnalysis /></el-icon>
          <div class="action-text">
            <div class="action-title">生成报告</div>
            <div class="action-desc">AI 一键生成个人/项目周报月报</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="action-card" @click="$router.push('/chat')">
          <el-icon :size="28" color="#e6a23c"><ChatDotRound /></el-icon>
          <div class="action-text">
            <div class="action-title">AI 助手</div>
            <div class="action-desc">基于日志数据权限的智能问答</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 项目日志分布 -->
    <el-card shadow="never" v-if="stats.byProject?.length">
      <template #header>
        <span class="card-title">各项目日志数量</span>
      </template>
      <div class="project-bars">
        <div v-for="item in stats.byProject" :key="item.id" class="project-bar-item">
          <span class="bar-label">{{ item.name }}</span>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: barWidth(item.cnt) + '%' }"></div>
          </div>
          <span class="bar-value">{{ item.cnt }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { logApi, projectApi } from '../api';
import { useUserStore } from '../stores/user';
import type { LogStats, Project } from '../types';

const userStore = useUserStore();
const stats = ref<LogStats>({ total: 0, today: 0, activeUsers: 0, byProject: [] });
const projects = ref<Project[]>([]);

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

function barWidth(cnt: number) {
  const max = Math.max(...stats.value.byProject.map((p) => p.cnt), 1);
  return Math.max(8, (cnt / max) * 100);
}

onMounted(async () => {
  try {
    const [statsRes, projectRes] = await Promise.all([logApi.stats(), projectApi.list()]);
    stats.value = statsRes.data;
    projects.value = projectRes.data || [];
  } catch {
    // 错误已在拦截器统一提示
  }
});
</script>

<style scoped>
.stat-row {
  margin-bottom: 16px;
}

.stat-card {
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 2px;
}

.action-row {
  margin-bottom: 16px;
}

.action-card {
  margin-bottom: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: transform 0.2s;
}

.action-card:hover {
  transform: translateY(-2px);
}

.action-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
}

.action-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.action-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.card-title {
  font-weight: 600;
}

.project-bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.bar-label {
  width: 140px;
  font-size: 13px;
  color: #606266;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .bar-label {
    width: 90px;
  }
}

.bar-track {
  flex: 1;
  height: 14px;
  background: #f0f2f5;
  border-radius: 7px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #79bbff);
  border-radius: 7px;
  transition: width 0.5s;
}

.bar-value {
  width: 40px;
  font-size: 13px;
  color: #606266;
  flex-shrink: 0;
}
</style>
