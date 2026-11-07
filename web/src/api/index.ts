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
  updateProfile: (data: { email: string }) => request.put('/auth/profile', data),
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
  addMember: (
    projectId: number,
    data: { userId: number; projectRole: string; groupId?: number; groupIds?: number[] }
  ) => request.post(`/projects/${projectId}/members`, data),
  updateMember: (
    projectId: number,
    memberUserId: number,
    data: { projectRole?: string; groupId?: number; groupIds?: number[] }
  ) => request.put(`/projects/${projectId}/members/${memberUserId}`, data),
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
    /** 涉及的小组标记（每组含投入工时，未填时后端按总工时均摊） */
    groups?: { groupId: number; hours?: number | null }[];
  }) => request.post('/logs', data),
  remove: (id: number) => request.delete(`/logs/${id}`),
  optimize: (data: { content: string; provider: string; promptId?: number }) =>
    request.post<{ optimizedContent: string; provider: string }>('/logs/optimize', data),
  /** 新版填报：对话式生成 + 质量检查 + 优化（多轮澄清） */
  assist: (data: {
    date: string;
    projectId?: number | null;
    todos?: { content: string; status: string }[];
    draft?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    provider?: string;
  }) => request.post<AssistResult>('/logs/assist', data),
  /**
   * 新版填报：流式 AI 生成（SSE）
   * onThink 实时回调思考过程增量文本；onFinal 返回结构化检查结果；onError 返回错误信息
   */
  assistStream: async (
    data: {
      date: string;
      projectId?: number | null;
      todos?: { content: string; status: string }[];
      history?: { role: 'user' | 'assistant'; content: string }[];
      provider?: string;
    },
    handlers: {
      onThink: (text: string) => void;
      onFinal: (data: AssistResult) => void;
      onError: (message: string) => void;
    }
  ) => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/logs/assist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok || !res.body) throw new Error(`请求失败(${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === 'think') handlers.onThink(evt.text || '');
          else if (evt.type === 'final') handlers.onFinal(evt.data);
          else if (evt.type === 'error') handlers.onError(evt.message || 'AI 调用失败');
        } catch {
          // 忽略不完整分片
        }
      }
    }
  },
  stats: (params?: { projectId?: number; startDate?: string; endDate?: string }) =>
    request.get<LogStats>('/logs/stats', { params }),
};

/** 新版填报 AI 质量检查结果 */
export interface AssistQuestion {
  field: string;
  question: string;
  options: string[];
}
export interface AssistResult {
  action: 'ask' | 'continue' | 'done';
  score?: number | null;
  summary?: string;
  questions: AssistQuestion[];
  result: {
    project?: string;
    content: string;
    hours: number | null;
    groups: { name: string; hours: number | null }[];
  } | null;
}

// ==================== 今日待办（新填报流程） ====================
export interface TodoItem {
  id: number;
  content: string;
  status: 'pending' | 'done';
  sort_order: number;
}
export interface TodoDaySummary {
  todo_date: string;
  total: number;
  done: number;
}

export const todoApi = {
  list: (date: string) => request.get<TodoItem[]>('/todos', { params: { date } }),
  save: (data: { date: string; items: { content: string; status: string }[] }) =>
    request.put<TodoItem[]>('/todos', data),
  history: (days?: number) => request.get<TodoDaySummary[]>('/todos/history', { params: { days } }),
};

// ==================== 报告 ====================
export const reportApi = {
  generate: (data: {
    type: 'weekly' | 'monthly';
    scope: 'personal' | 'project';
    targetUserId?: number;
    projectId?: number;
    date?: string;
    startDate?: string;
    endDate?: string;
    provider?: string;
    promptId?: number;
    /** 项目报告呈现方式：group=按小组分组（默认），flat=汇总平铺 */
    groupBy?: 'group' | 'flat';
  }) => request.post<Report>('/reports/generate', data),
  list: (params: { type?: string; scope?: string; projectId?: number; page?: number; pageSize?: number }) =>
    request.get<{ list: Report[]; total: number }>('/reports', { params }),
  detail: (id: number) => request.get<Report>(`/reports/${id}`),
  update: (id: number, data: { content: string }) => request.put(`/reports/${id}`, data),
  remove: (id: number) => request.delete(`/reports/${id}`),
};

// ==================== 修改审批（日志/报告跨周修改） ====================
export interface EditApproval {
  id: number;
  user_id: number;
  user_name?: string;
  username?: string;
  target_type: 'log' | 'report';
  target_id: number;
  target_summary?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'used';
  approve_note?: string;
  approver_id?: number;
  approved_at?: string;
  created_at: string;
}

export const approvalApi = {
  create: (data: { targetType: 'log' | 'report'; targetId: number; reason: string }) =>
    request.post('/approvals', data),
  mine: () => request.get<EditApproval[]>('/approvals/mine'),
  pending: () => request.get<EditApproval[]>('/approvals/pending'),
  handle: (id: number, data: { approved: boolean; note?: string }) =>
    request.put(`/approvals/${id}`, data),
};

// ==================== 用户反馈 ====================
export interface Feedback {
  id: number;
  user_id: number;
  user_name?: string;
  username?: string;
  content: string;
  contact?: string;
  status: 'pending' | 'processed';
  admin_reply?: string;
  created_at: string;
}

export const feedbackApi = {
  create: (data: { content: string; contact?: string }) => request.post('/feedback', data),
  mine: () => request.get<Feedback[]>('/feedback/mine'),
  adminList: (params?: { status?: string }) =>
    request.get<Feedback[]>('/admin/feedback', { params }),
  adminReply: (id: number, data: { adminReply?: string; status?: string }) =>
    request.put(`/admin/feedback/${id}`, data),
};

// ==================== 版本管理 ====================
export interface AppVersion {
  id: number;
  version: string;
  title: string;
  description: string;
  released_at: string;
}

export const versionApi = {
  list: () => request.get<AppVersion[]>('/versions'),
  adminList: () => request.get<AppVersion[]>('/admin/versions'),
  release: (data: { version: string; title: string; description: string }) =>
    request.post('/admin/versions', data),
  remove: (id: number) => request.delete(`/admin/versions/${id}`),
};

// ==================== 收件箱通知 ====================
export interface Notification {
  id: number;
  user_id: number;
  title: string;
  content: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export const notificationApi = {
  list: (params: { page?: number; pageSize?: number }) =>
    request.get<{ list: Notification[]; total: number }>('/notifications', { params }),
  unreadCount: () => request.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: number) => request.put(`/notifications/${id}/read`),
  markAllRead: () => request.put('/notifications/read-all'),
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
  // 按角色的菜单可见性（JSON 字符串）
  role_menus?: string;
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
  /** 以下菜单支持按角色配置可见性（默认可见） */
  dashboard?: boolean;
  inbox?: boolean;
  approvals?: boolean;
  feedback?: boolean;
}

/** 角色菜单可见性配置：角色 → 菜单开关 */
export type RoleMenuConfig = Record<string, Record<string, boolean>>;

export const configApi = {
  menus: () => request.get<{ menus: MenuVisibility }>('/config/menus'),
};

export type { ProjectMember };
