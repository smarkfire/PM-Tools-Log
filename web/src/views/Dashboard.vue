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

    <!-- 本周填写进度（行动导向） -->
    <el-card shadow="never" class="week-card">
      <div class="week-head">
        <div class="week-head-left">
          <el-icon class="week-icon"><Calendar /></el-icon>
          <span class="week-title">本周填写进度</span>
        </div>
        <span class="week-count">
          {{ stats.weekProgress.filled }} <em>/ {{ stats.weekProgress.total }}</em> 天
        </span>
      </div>
      <el-progress
        :percentage="weekPercent"
        :stroke-width="12"
        :show-text="false"
        :color="weekPercent >= 100 ? '#67c23a' : '#409eff'"
        class="week-progress"
      />
      <div class="week-foot">
        <span v-if="weekPercent >= 100" class="week-tip week-tip--done">本周日志已填满，继续保持！</span>
        <span v-else class="week-tip">
          本周还有 <strong>{{ stats.weekProgress.total - stats.weekProgress.filled }}</strong> 天未填，记得记录工作哦
        </span>
        <el-button
          v-if="weekPercent < 100"
          link
          type="primary"
          size="small"
          @click="$router.push('/logs/write')"
        >
          去填写
        </el-button>
      </div>
    </el-card>

    <!-- 统计卡片（按数据权限视图区分团队/个人） -->
    <el-row :gutter="16" class="stat-row">
      <el-col v-for="c in cards" :key="c.label" :xs="12" :sm="6">
        <el-card shadow="hover" class="stat-card" :class="'stat-card--' + c.color">
          <div class="stat-item">
            <div class="stat-icon">
              <el-icon :size="22"><component :is="c.icon" /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ c.display }}</div>
              <div class="stat-label">{{ c.label }}</div>
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

    <!-- 近 7 日填写趋势（主图） -->
    <el-card shadow="never" class="trend-card">
      <template #header>
        <div class="dist-header">
          <span class="card-title">近 7 日填写趋势</span>
          <span class="dist-hint">{{ stats.scopeType === 'team' ? '团队' : '我的' }} · 按天统计</span>
        </div>
      </template>
      <div class="trend-chart">
        <div v-for="d in trend7dFull" :key="d.date" class="trend-col">
          <span class="trend-val">{{ d.cnt }}</span>
          <div class="trend-bar-track">
            <div class="trend-bar" :style="{ height: d.height + 'px' }"></div>
          </div>
          <span class="trend-date" :class="{ 'trend-today': d.isToday }">{{ d.label }}</span>
        </div>
      </div>
    </el-card>

    <!-- 各项目日志分布（次图） -->
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
const stats = ref<LogStats>({
  scopeType: 'self',
  total: 0,
  today: 0,
  activeUsers: 0,
  avgScore: null,
  todayScore: null,
  todayUsers: 0,
  weekProgress: { filled: 0, total: 5 },
  trend7d: [],
  byProject: [],
});
const projects = ref<Project[]>([]);

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

// 统计卡：按数据权限视图切换团队/个人口径
const cards = computed(() => {
  if (stats.value.scopeType === 'team') {
    return [
      { label: '团队日志', display: String(stats.value.total), icon: Document, color: 'blue' },
      { label: '今日已填', display: stats.value.todayUsers + ' 人', icon: Calendar, color: 'green' },
      { label: '活跃成员', display: stats.value.activeUsers + ' 人', icon: User, color: 'orange' },
      { label: '管辖项目', display: String(projects.value.length), icon: Folder, color: 'purple' },
    ];
  }
  return [
    { label: '我的日志', display: String(stats.value.total), icon: Document, color: 'blue' },
    { label: '今日得分', display: stats.value.todayScore != null ? stats.value.todayScore + ' 分' : '未填', icon: Calendar, color: 'green' },
    { label: '我的平均分', display: stats.value.avgScore != null ? stats.value.avgScore + ' 分' : '未评', icon: User, color: 'orange' },
    { label: '参与项目', display: String(projects.value.length), icon: Folder, color: 'purple' },
  ];
});

// 本周填写进度百分比（上限 100）
const weekPercent = computed(() => {
  const { filled, total } = stats.value.weekProgress;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((filled / total) * 100));
});

// 近 7 日趋势：补全缺失日期为 0，按最大值归一化柱高
function localDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const trend7dFull = computed(() => {
  const map = new Map<string, number>();
  for (const t of stats.value.trend7d) map.set((t.date || '').slice(0, 10), t.cnt);
  const days: { date: string; label: string; isToday: boolean; cnt: number; height: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDateStr(d);
    days.push({
      date: key,
      label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`,
      isToday: i === 0,
      cnt: map.get(key) || 0,
      height: 0,
    });
  }
  const max = Math.max(...days.map((x) => x.cnt), 1);
  days.forEach((x) => (x.height = Math.round((x.cnt / max) * 80)));
  return days;
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

/* 本周填写进度 */
.week-card {
  margin-bottom: 16px;
  border-left: 4px solid var(--primary-color, #409eff);
}

.week-card :deep(.el-card__body) {
  padding: 16px 20px;
}

.week-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.week-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.week-icon {
  color: var(--primary-color, #409eff);
  font-size: 18px;
}

.week-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.week-count {
  font-size: 14px;
  color: var(--text-regular);
}

.week-count em {
  font-style: normal;
  font-size: 20px;
  font-weight: 700;
  color: var(--primary-color, #409eff);
}

.week-progress {
  margin-bottom: 10px;
}

.week-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.week-tip {
  font-size: 13px;
  color: var(--text-secondary);
}

.week-tip strong {
  color: var(--danger-color, #f56c6c);
}

.week-tip--done {
  color: var(--success-color, #67c23a);
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
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  white-space: nowrap;
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

/* 近 7 日趋势图 */
.trend-card {
  margin-bottom: 16px;
}

.trend-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 4px 0;
  height: 150px;
}

.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.trend-val {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-regular);
  height: 18px;
}

.trend-bar-track {
  flex: 1;
  width: 100%;
  max-width: 36px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.trend-bar {
  width: 100%;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, #79bbff, #409eff);
  transition: height 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.25);
}

.trend-date {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}

.trend-today {
  color: var(--primary-color, #409eff);
  font-weight: 600;
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

@media (max-width: 768px) {
  .hero-banner {
    padding: 16px;
  }
  .hero-greeting {
    font-size: 17px;
  }
  .bar-label {
    width: 90px;
  }
  .trend-chart {
    gap: 4px;
  }
}
</style>