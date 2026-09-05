/**
 * 数据权限服务（RBAC 核心）
 *
 * 角色体系与数据范围：
 * - 项目总监（director，全局角色）  → 查看所有项目、所有成员的日志
 * - 项目经理（manager，项目角色）   → 查看所管辖项目内所有成员的日志
 * - 小组长  （leader，项目角色）    → 查看项目内本小组成员的日志
 * - 组员    （member）             → 仅查看自己的日志
 *
 * 一个用户可在不同项目中承担不同角色，数据范围取并集。
 */
import { queryMany, queryOne } from '../config/db';
import { DataScope, GlobalRole } from '../types';

/**
 * 计算用户的数据权限范围
 */
export async function getDataScope(userId: number): Promise<DataScope> {
  // 1. 项目总监：全部数据
  const user = await queryOne<{ role: GlobalRole }>('SELECT role FROM users WHERE id = $1', [userId]);
  if (!user) {
    return { type: 'self', userIds: [userId], projectIds: [] };
  }
  if (user.role === 'director') {
    return { type: 'all', userIds: null, projectIds: null };
  }

  const userIds = new Set<number>([userId]); // 永远可以看到自己的数据
  const projectIds = new Set<number>();
  let hasProjectScope = false;

  // 2. 作为项目经理：管辖项目内全部成员
  const managedProjects = await queryMany<{ project_id: number }>(
    `SELECT DISTINCT project_id FROM project_members WHERE user_id = $1 AND project_role = 'manager'`,
    [userId]
  );
  if (managedProjects.length > 0) {
    hasProjectScope = true;
    const pids = managedProjects.map((p) => p.project_id);
    pids.forEach((p) => projectIds.add(p));
    const members = await queryMany<{ user_id: number }>(
      `SELECT DISTINCT user_id FROM project_members WHERE project_id = ANY($1::int[])`,
      [pids]
    );
    members.forEach((m) => userIds.add(m.user_id));
  }

  // 3. 作为小组长：项目内本小组的成员
  const ledGroups = await queryMany<{ group_id: number; project_id: number }>(
    `SELECT DISTINCT pm.group_id, pm.project_id
     FROM project_members pm
     JOIN project_groups pg ON pg.id = pm.group_id
     WHERE pm.user_id = $1 AND pm.project_role = 'leader' AND pm.group_id IS NOT NULL`,
    [userId]
  );
  if (ledGroups.length > 0) {
    const gids = ledGroups.map((g) => g.group_id);
    ledGroups.forEach((g) => projectIds.add(g.project_id));
    const groupMembers = await queryMany<{ user_id: number }>(
      `SELECT DISTINCT user_id FROM project_members WHERE group_id = ANY($1::int[])`,
      [gids]
    );
    groupMembers.forEach((m) => userIds.add(m.user_id));
  }

  if (hasProjectScope || ledGroups.length > 0) {
    // 若管理了完整项目则范围类型为 project，否则为 group
    const type = managedProjects.length > 0 ? 'project' : 'group';
    return { type, userIds: [...userIds], projectIds: [...projectIds] };
  }

  // 4. 普通成员：仅自己
  return { type: 'self', userIds: [userId], projectIds: [] };
}

/**
 * 判断用户是否为项目总监
 */
export async function isDirector(userId: number): Promise<boolean> {
  const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  return user?.role === 'director';
}

/**
 * 判断用户是否为某项目的项目经理
 */
export async function isProjectManager(userId: number, projectId: number): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1 FROM project_members WHERE user_id = $1 AND project_id = $2 AND project_role = 'manager'`,
    [userId, projectId]
  );
  return !!row;
}

/**
 * 判断用户对某项目是否有管理权限（总监或该项目经理）
 */
export async function canManageProject(userId: number, projectId: number): Promise<boolean> {
  if (await isDirector(userId)) return true;
  return isProjectManager(userId, projectId);
}

/**
 * 判断用户是否可以查看目标用户的日志
 */
export async function canViewUserLogs(currentUserId: number, targetUserId: number): Promise<boolean> {
  if (currentUserId === targetUserId) return true;
  const scope = await getDataScope(currentUserId);
  if (scope.type === 'all') return true;
  return scope.userIds?.includes(targetUserId) ?? false;
}

/**
 * 判断用户是否可以查看某项目（成员身份或管理权限）
 */
export async function canAccessProject(userId: number, projectId: number): Promise<boolean> {
  if (await isDirector(userId)) return true;
  const row = await queryOne(
    'SELECT 1 FROM project_members WHERE user_id = $1 AND project_id = $2',
    [userId, projectId]
  );
  return !!row;
}

/**
 * 获取用户可见的项目 ID 列表（用于列表过滤）
 * director → 全部；其他 → 参与/管理的项目
 */
export async function getVisibleProjectIds(userId: number): Promise<number[] | null> {
  if (await isDirector(userId)) return null; // null 表示全部
  const rows = await queryMany<{ project_id: number }>(
    'SELECT DISTINCT project_id FROM project_members WHERE user_id = $1',
    [userId]
  );
  return rows.map((r) => r.project_id);
}
