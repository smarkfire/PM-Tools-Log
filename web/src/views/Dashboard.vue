<template>
  <div class="page-container dashboard">
    <!-- 欢迎横幅 -->
    <div class="hero-banner">
      <div class="hero-content">
        <div class="hero-greeting">{{ greeting }}，{{ userStore.user?.displayName }}</div>
        <div class="hero-sub">
          {{ userStore.roleLabel }} · 今天也要认真记录工作哦
        </div>
      </div>
      <el-button type="primary" size="large" class="hero-btn" @click="$router.push('/logs/write')">
        <el-icon><EditPen /></el-icon>
        <span>写日志</span>
      </el-button>
    </div>

    <!-- 统计卡片（响应式栅格） -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card stat-card--blue">
          <div class="stat-item">
            <div class="stat-icon">
              <el-icon :size="22"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total }}</div>
              <div class="stat-label">日志总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card stat-card--green">
          <div class="stat-item">
            <div class="stat-icon">
              <el-icon :size="22"><Calendar /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.today }}</div>
              <div class="stat-label">今日已填</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card stat-card--orange">
          <div class="stat-item">
            <div class="stat-icon">
              <el-icon :size="22"><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.activeUsers }}</div>
              <div class="stat-label">活跃成员</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card stat-card--purple">
          <div class="stat-item">
            <div class="stat-icon">
              <el-icon :size="22"><Folder /></el-icon>
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
          <div class="action-icon action-icon--blue">
            <el-icon :size="24"><EditPen /></el-icon>
          </div>
          <div class="action-text">
            <div class="action-title">填写日志</div>
            <div class="action-desc">记录今天的工作，可用 AI 优化</div>
          </div>
          <el-icon class="action-arrow"><ArrowRight /></el-icon>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="action-card" @click="$router.push('/reports')">
          <div class="action-icon action-icon--green">
            <el-icon :size="24"><DataAnalysis /></el-icon>
          </div>
          <div class="action-text">
            <div class="action-title">生成报告</div>
            <div class="action-desc">AI 一键生成个人/项目周报月报</div>
          </div>
          <el-icon class="action-arrow"><ArrowRight /></el-icon>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <el-card shadow="hover" class="action-card" @click="$router.push('/chat')">
          <div class="action-icon action-icon--orange">
            <el-icon :size="24"><ChatDotRound /></el-icon>
          </div>
          <div class="action-text">
            <div class="action-title">AI 助手</div>
            <div class="action-desc">基于日志数据权限的智能问答</div>
          </div>
          <el-icon class="action-arrow"><ArrowRight /></el-icon>
        </el-card>
      </el-col>
    </el-row>

    <!-- 项目日志分布 -->
    <el-card shadow="never" v-if="stats.byProject?.length" class="dist-card">
      <template #header>
        <div class="dist-header">
          <span class="card-title">各项目日志数量</span>
          <span class="dist-hint">最近统计</span>
        </div>
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
import {
  Document,
  Calendar,
  User,
  Folder,
  EditPen,
  DataAnalysis,
  ChatDotRound,
  ArrowRight,
} from '@element-plus/icons-vue';
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
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
}

/* 欢迎横幅 */
.hero-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px;
  margin-bottom: 16px;
  border-radius: var(--radius-xl, 14px);
  background: linear-gradient(120deg, #1d2939 0%, #2a3a52 55%, #3b4f6e 100%);
  color: #fff;
  box-shadow: 0 8px 24px rgba(29, 41, 57, 0.18);
}

.hero-greeting {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.hero-sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
  margin-top: 6px;
}

.hero-btn {
  flex-shrink: 0;
  border-radius: 10px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.4);
}

@media (max-width: 768px) {
  .hero-banner {
    padding: 16px;
  }
  .hero-greeting {
    font-size: 17px;
  }
}

/* 统计卡片 */
.stat-row {
  margin-bottom: 4px;
}

.stat-card {
  margin-bottom: 12px;
}

.stat-card :deep(.el-card__body) {
  padding: 18px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.stat-card--blue .stat-icon { background: linear-gradient(135deg, #409eff, #337ecc); box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3); }
.stat-card--green .stat-icon { background: linear-gradient(135deg, #67c23a, #4a9c2e); box-shadow: 0 4px 12px rgba(103, 194, 58, 0.3); }
.stat-card--orange .stat-icon { background: linear-gradient(135deg, #e6a23c, #c87f17); box-shadow: 0 4px 12px rgba(230, 162, 60, 0.3); }
.stat-card--purple .stat-icon { background: linear-gradient(135deg, #9b59e6, #7d3bc4); box-shadow: 0 4px 12px rgba(155, 89, 230, 0.3); }

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 3px;
}

/* 快捷操作 */
.action-row {
  margin-bottom: 4px;
}

.action-card {
  margin-bottom: 12px;
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.action-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  width: 100%;
}

.action-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.action-icon--blue { background: linear-gradient(135deg, #409eff, #337ecc); }
.action-icon--green { background: linear-gradient(135deg, #67c23a, #4a9c2e); }
.action-icon--orange { background: linear-gradient(135deg, #e6a23c, #c87f17); }

.action-text {
  flex: 1;
  min-width: 0;
}

.action-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.action-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-arrow {
  color: var(--text-placeholder);
  transition: transform var(--transition-base), color var(--transition-base);
}

.action-card:hover .action-arrow {
  transform: translateX(4px);
  color: var(--primary-color);
}

/* 项目分布 */
.dist-card {
  margin-top: 4px;
}

.dist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-weight: 600;
}

.dist-hint {
  font-size: 12px;
  color: var(--text-placeholder);
}

.project-bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.project-bar-item:last-child {
  margin-bottom: 0;
}

.bar-label {
  width: 140px;
  font-size: 13px;
  color: var(--text-regular);
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
  height: 16px;
  background: #f0f2f5;
  border-radius: 8px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #79bbff);
  border-radius: 8px;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.25);
}

.bar-value {
  width: 40px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-regular);
  flex-shrink: 0;
  text-align: right;
}
</style>
