/**
 * 路由配置与权限守卫
 */
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useUserStore } from '../stores/user';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { title: '注册', public: true },
  },
  {
    path: '/',
    component: () => import('../views/layout/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '工作台' },
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../views/logs/LogList.vue'),
        meta: { title: '我的日志' },
      },
      {
        path: 'logs/all',
        name: 'AllLogs',
        component: () => import('../views/logs/LogList.vue'),
        meta: { title: '团队日志' },
      },
      {
        path: 'logs/write',
        name: 'WriteLog',
        component: () => import('../views/logs/WriteLog.vue'),
        meta: { title: '填写日志' },
      },
      {
        path: 'projects',
        name: 'Projects',
        component: () => import('../views/projects/ProjectList.vue'),
        meta: { title: '项目管理' },
      },
      {
        path: 'projects/:id',
        name: 'ProjectDetail',
        component: () => import('../views/projects/ProjectDetail.vue'),
        meta: { title: '项目详情' },
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('../views/reports/ReportList.vue'),
        meta: { title: '报告中心' },
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('../views/chat/ChatView.vue'),
        meta: { title: 'AI 助手' },
      },
      {
        path: 'prompts',
        name: 'Prompts',
        component: () => import('../views/settings/PromptSettings.vue'),
        meta: { title: '提示词配置' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('../views/settings/UserManagement.vue'),
        meta: { title: '用户管理', roles: ['director'] },
      },
      {
        path: 'admin/settings',
        name: 'AdminSettings',
        component: () => import('../views/settings/AdminSettings.vue'),
        meta: { title: '系统设置', roles: ['director'] },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('../views/settings/Profile.vue'),
        meta: { title: '个人设置' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：登录校验 + 角色校验
router.beforeEach(async (to, _from, next) => {
  document.title = `${to.meta.title || ''} - 日志管理系统`;
  const userStore = useUserStore();

  // 公开页面直接放行
  if (to.meta.public) {
    if (userStore.isLoggedIn && (to.name === 'Login' || to.name === 'Register')) {
      next('/dashboard');
      return;
    }
    next();
    return;
  }

  // 未登录跳转登录页
  if (!userStore.isLoggedIn) {
    next('/login');
    return;
  }

  // 角色权限校验
  const requiredRoles = to.meta.roles as string[] | undefined;
  if (requiredRoles && !requiredRoles.includes(userStore.user?.role || 'member')) {
    next('/dashboard');
    return;
  }

  next();
});

export default router;
