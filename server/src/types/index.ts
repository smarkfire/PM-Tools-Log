/**
 * 类型定义
 */

/** 全局角色 */
export type GlobalRole = 'director' | 'manager' | 'leader' | 'member';

/** 项目内角色 */
export type ProjectRole = 'manager' | 'leader' | 'member';

/** 数据权限范围 */
export interface DataScope {
  /** all: 全部数据（项目总监）; project: 管理的项目; group: 所在小组; self: 仅本人 */
  type: 'all' | 'project' | 'group' | 'self';
  /** 有权访问的用户ID列表（all 时为 null） */
  userIds: number[] | null;
  /** 有权访问的项目ID列表（all 时为 null） */
  projectIds: number[] | null;
}

/** 请求中挂载的用户信息 */
export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: GlobalRole;
}

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: GlobalRole;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_by: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemberRow {
  id: number;
  project_id: number;
  user_id: number;
  project_role: ProjectRole;
  group_id: number | null;
  joined_at: string;
}

export interface WorkLogRow {
  id: number;
  user_id: number;
  project_id: number | null;
  log_date: string;
  content: string;
  optimized_content: string | null;
  ai_provider: string | null;
  hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface UserPromptRow {
  id: number;
  user_id: number;
  type: 'log_optimize' | 'report' | 'chat';
  name: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: number;
  user_id: number;
  title: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ReportRow {
  id: number;
  type: 'weekly' | 'monthly';
  scope: 'personal' | 'project';
  user_id: number;
  target_user_id: number | null;
  project_id: number | null;
  period_start: string;
  period_end: string;
  content: string;
  ai_provider: string | null;
  created_at: string;
}
