/**
 * 前端类型定义
 */

/** 全局角色 */
export type GlobalRole = 'director' | 'manager' | 'leader' | 'member';

/** 项目内角色 */
export type ProjectRole = 'manager' | 'leader' | 'member';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: GlobalRole;
}

export interface Membership {
  projectId: number;
  projectName: string;
  projectRole: ProjectRole;
  groupId: number | null;
  groupName: string | null;
}

export interface UserInfo extends AuthUser {
  email: string;
  memberships: Membership[];
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_by: number;
  start_date: string | null;
  end_date: string | null;
  member_count: number;
  log_count: number;
  groups: ProjectGroup[];
  members: ProjectMember[];
  myRole: ProjectRole | null;
}

export interface ProjectGroup {
  id: number;
  project_id: number;
  name: string;
  leader_id: number | null;
  leaderName?: string | null;
}

export interface ProjectMember {
  userId: number;
  username: string;
  displayName: string;
  projectRole: ProjectRole;
  groupId: number | null;
  groupName: string | null;
}

export interface WorkLog {
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
  user_name?: string;
  username?: string;
  project_name?: string;
}

export interface LogStats {
  total: number;
  today: number;
  activeUsers: number;
  byProject: { id: number; name: string; cnt: number }[];
}

export interface UserPrompt {
  id: number;
  user_id: number;
  type: 'log_optimize' | 'report' | 'chat';
  name: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** 系统默认提示词（用户无自定义时使用） */
export interface SystemPrompt {
  id: number;
  type: 'log_optimize' | 'report' | 'chat';
  name: string;
  content: string;
}

export interface Conversation {
  id: number;
  user_id: number;
  title: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface Report {
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
  generator_name?: string;
  target_name?: string | null;
  project_name?: string | null;
}
