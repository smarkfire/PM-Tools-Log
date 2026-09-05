/**
 * API 接口封装
 */
import request from './request';
import type {
  AuthUser,
  UserInfo,
  Project,
  WorkLog,
  LogStats,
  UserPrompt,
  SystemPrompt,
  Conversation,
  ChatMessage,
  Report,
  ProjectMember,
} from '../types';

// ==================== 认证 ====================
export const authApi = {
  register: (data: { username: string; email: string; password: string; displayName?: string }) =>
    request.post('/auth/register', data),
  login: (data: { username: string; password: string }) =>
    request.post<{ token: string; user: AuthUser }>('/auth/login', data),
  me: () => request.get<UserInfo>('/auth/me'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request.put('/auth/password', data),
};

// ==================== 用户 ====================
export const userApi = {
  list: (keyword?: string) => request.get('/users', { params: { keyword } }),
  updateRole: (id: number, role: string) => request.put(`/users/${id}/role`, { role }),
  available: (projectId: number, keyword?: string) =>
    request.get('/users/available', { params: { projectId, keyword } }),
};

// ==================== 项目 ====================
export const projectApi = {
  list: () => request.get<Project[]>('/projects'),
  create: (data: { name: string; description?: string; startDate?: string; endDate?: string }) =>
    request.post('/projects', data),
  update: (id: number, data: Partial<Project>) => request.put(`/projects/${id}`, data),
  addMember: (projectId: number, data: { userId: number; projectRole: string; groupId?: number }) =>
    request.post(`/projects/${projectId}/members`, data),
  updateMember: (projectId: number, memberUserId: number, data: { projectRole?: string; groupId?: number }) =>
    request.put(`/projects/${projectId}/members/${memberUserId}`, data),
  removeMember: (projectId: number, memberUserId: number) =>
    request.delete(`/projects/${projectId}/members/${memberUserId}`),
  createGroup: (projectId: number, data: { name: string; leaderId?: number }) =>
    request.post(`/projects/${projectId}/groups`, data),
  deleteGroup: (projectId: number, groupId: number) =>
    request.delete(`/projects/${projectId}/groups/${groupId}`),
};

// ==================== 日志 ====================
export interface LogQuery {
  projectId?: number;
  userId?: number;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export const logApi = {
  list: (params: LogQuery) =>
    request.get<{ list: WorkLog[]; total: number; page: number; pageSize: number }>('/logs', { params }),
  detail: (id: number) => request.get<WorkLog>(`/logs/${id}`),
  save: (data: {
    logDate: string;
    projectId?: number | null;
    content: string;
    optimizedContent?: string;
    aiProvider?: string;
    hours?: number;
  }) => request.post('/logs', data),
  remove: (id: number) => request.delete(`/logs/${id}`),
  optimize: (data: { content: string; provider: string; promptId?: number }) =>
    request.post<{ optimizedContent: string; provider: string }>('/logs/optimize', data),
  stats: (params?: { projectId?: number; startDate?: string; endDate?: string }) =>
    request.get<LogStats>('/logs/stats', { params }),
};

// ==================== 报告 ====================
export const reportApi = {
  generate: (data: {
    type: 'weekly' | 'monthly';
    scope: 'personal' | 'project';
    targetUserId?: number;
    projectId?: number;
    date?: string;
    provider?: string;
    promptId?: number;
  }) => request.post<Report>('/reports/generate', data),
  list: (params: { type?: string; scope?: string; projectId?: number; page?: number; pageSize?: number }) =>
    request.get<{ list: Report[]; total: number }>('/reports', { params }),
  detail: (id: number) => request.get<Report>(`/reports/${id}`),
  remove: (id: number) => request.delete(`/reports/${id}`),
};

// ==================== 提示词 ====================
export const promptApi = {
  list: (type?: string) =>
    request.get<{ prompts: UserPrompt[]; systemPrompts: SystemPrompt[]; hasCustomDefault: boolean }>(
      '/prompts',
      { params: { type } }
    ),
  create: (data: { type: string; name: string; content: string; isDefault?: boolean }) =>
    request.post('/prompts', data),
  update: (id: number, data: { name?: string; content?: string; isDefault?: boolean }) =>
    request.put(`/prompts/${id}`, data),
  remove: (id: number) => request.delete(`/prompts/${id}`),
};

// ==================== AI 对话 ====================
export const chatApi = {
  providers: () =>
    request.get<{
      providers: string[];
      qwenConfigured: boolean;
      deepseekConfigured: boolean;
      keySource: { qwen: string; deepseek: string };
    }>('/chat/providers'),
  conversations: () => request.get<Conversation[]>('/chat/conversations'),
  createConversation: (data?: { title?: string; provider?: string }) =>
    request.post<Conversation>('/chat/conversations', data || {}),
  deleteConversation: (id: number) => request.delete(`/chat/conversations/${id}`),
  messages: (id: number) => request.get<ChatMessage[]>(`/chat/conversations/${id}/messages`),
  send: (id: number, data: { content: string; provider?: string; promptId?: number }) =>
    request.post(`/chat/conversations/${id}/messages`, data),
};

// ==================== 系统配置（管理员） ====================
export interface AdminConfig {
  // AI Key（脱敏值 + 是否已设置）
  qwen_api_key: string;
  qwen_api_key__set: boolean;
  qwen_base_url: string;
  qwen_model: string;
  deepseek_api_key: string;
  deepseek_api_key__set: boolean;
  deepseek_base_url: string;
  deepseek_model: string;
  // 菜单开关
  menu_logs_write: string;
  menu_logs: string;
  menu_logs_all: string;
  menu_projects: string;
  menu_reports: string;
  menu_chat: string;
  menu_prompts: string;
  menu_users: string;
  menu_ai_settings: string;
  [key: string]: string | boolean;
}

export const adminConfigApi = {
  get: () => request.get<AdminConfig>('/admin/config'),
  update: (data: Record<string, string | boolean>) => request.put('/admin/config', data),
};

// ==================== 用户 AI 配置 ====================
export interface MyAiConfig {
  qwenApiKey: string;
  qwenKeySet: boolean;
  deepseekApiKey: string;
  deepseekKeySet: boolean;
  preferredProvider: string;
  effectiveSource: { qwen: string; deepseek: string };
  effective: {
    qwen: { baseUrl: string; model: string };
    deepseek: { baseUrl: string; model: string };
  };
}

export const aiConfigApi = {
  get: () => request.get<MyAiConfig>('/ai-config'),
  update: (data: { qwenApiKey?: string; deepseekApiKey?: string; preferredProvider?: string }) =>
    request.put('/ai-config', data),
};

// ==================== 菜单可见性 ====================
export interface MenuVisibility {
  logsWrite: boolean;
  logs: boolean;
  logsAll: boolean;
  projects: boolean;
  reports: boolean;
  chat: boolean;
  prompts: boolean;
  users: boolean;
  aiSettings: boolean;
}

export const configApi = {
  menus: () => request.get<{ menus: MenuVisibility }>('/config/menus'),
};

export type { ProjectMember };
