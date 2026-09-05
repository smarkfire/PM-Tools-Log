/**
 * 项目管理控制器
 *
 * 权限规则：
 * - 创建项目：项目总监、项目经理
 * - 编辑项目/管理成员/管理小组：项目总监、该项目项目经理
 * - 查看项目：项目总监看全部；其他人看自己参与的项目
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import {
  isDirector,
  canManageProject,
  getVisibleProjectIds,
} from '../services/permission.service';

/**
 * 获取项目列表（按当前用户可见范围）
 * GET /api/projects
 */
export async function listProjects(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const visibleIds = await getVisibleProjectIds(userId);

  let sql = `
    SELECT p.*,
      (SELECT COUNT(*)::int FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
      (SELECT json_agg(json_build_object('id', pg.id, 'name', pg.name, 'leaderId', pg.leader_id,
              'leaderName', u.display_name))
        FROM project_groups pg LEFT JOIN users u ON u.id = pg.leader_id
        WHERE pg.project_id = p.id) AS groups,
      (SELECT json_agg(json_build_object('userId', pm.user_id, 'username', u.username,
              'displayName', u.display_name, 'projectRole', pm.project_role,
              'groupId', pm.group_id, 'groupName', g.name))
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        LEFT JOIN project_groups g ON g.id = pm.group_id
        WHERE pm.project_id = p.id) AS members,
      (SELECT COUNT(*)::int FROM work_logs wl WHERE wl.project_id = p.id) AS log_count
    FROM projects p`;
  const params: any[] = [];
  if (visibleIds !== null) {
    if (visibleIds.length === 0) {
      res.json(success([]));
      return;
    }
    params.push(visibleIds);
    sql += ` WHERE p.id = ANY($1::int[])`;
  }
  sql += ` ORDER BY p.id DESC`;

  const projects = await queryMany(sql, params);
  // 追加当前用户在各项目中的角色，便于前端展示
  const memberships = await queryMany<{ project_id: number; project_role: string }>(
    'SELECT project_id, project_role FROM project_members WHERE user_id = $1',
    [userId]
  );
  const roleMap = new Map(memberships.map((m) => [m.project_id, m.project_role]));
  const result = projects.map((p) => ({
    ...p,
    groups: p.groups || [],
    members: p.members || [],
    myRole: roleMap.get(p.id) || null,
  }));
  res.json(success(result));
}

/**
 * 创建项目（总监/项目经理）
 * POST /api/projects
 */
export async function createProject(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { name, description, startDate, endDate } = req.body || {};
  if (!name?.trim()) {
    res.status(400).json(fail('项目名称为必填项'));
    return;
  }
  const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  const isManagerGlobal = user?.role === 'manager' || user?.role === 'director';
  if (!isManagerGlobal) {
    // 非总监且全局角色非经理的用户无权创建项目
    res.status(403).json(fail('无权限：仅项目总监或项目经理可创建项目', 403));
    return;
  }

  const project = await queryOne(
    `INSERT INTO projects (name, description, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name.trim(), description || null, startDate || null, endDate || null, userId]
  );
  // 创建者自动成为该项目的项目经理
  await queryOne(
    `INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, 'manager')`,
    [project!.id, userId]
  );
  res.json(success(project, '项目创建成功'));
}

/**
 * 更新项目（总监/该项目经理）
 * PUT /api/projects/:id
 */
export async function updateProject(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const projectId = parseInt(req.params.id, 10);
  if (!(await canManageProject(userId, projectId))) {
    res.status(403).json(fail('无权限：仅项目总监或该项目经理可编辑项目', 403));
    return;
  }
  const { name, description, status, startDate, endDate } = req.body || {};
  if (name !== undefined && !name?.trim()) {
    res.status(400).json(fail('项目名称不能为空'));
    return;
  }
  const project = await queryOne(
    `UPDATE projects SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       status = COALESCE($3, status),
       start_date = COALESCE($4, start_date),
       end_date = COALESCE($5, end_date),
       updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [name, description, status, startDate, endDate, projectId]
  );
  if (!project) {
    res.status(404).json(fail('项目不存在'));
    return;
  }
  res.json(success(project, '项目更新成功'));
}

/**
 * 添加项目成员（总监/该项目经理）
 * POST /api/projects/:id/members
 */
export async function addMember(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const projectId = parseInt(req.params.id, 10);
  const { userId: memberUserId, projectRole, groupId } = req.body || {};
  if (!(await canManageProject(userId, projectId))) {
    res.status(403).json(fail('无权限：仅项目总监或该项目经理可管理成员', 403));
    return;
  }
  if (!memberUserId) {
    res.status(400).json(fail('缺少用户ID'));
    return;
  }
  const validRoles = ['manager', 'leader', 'member'];
  if (!validRoles.includes(projectRole)) {
    res.status(400).json(fail('无效的项目角色'));
    return;
  }
  // 每个项目只能有一个项目经理，添加 manager 时若已存在则拒绝
  if (projectRole === 'manager') {
    const existingManager = await queryOne(
      `SELECT user_id FROM project_members WHERE project_id = $1 AND project_role = 'manager'`,
      [projectId]
    );
    if (existingManager) {
      res.status(400).json(fail('该项目已有项目经理，请先调整原经理角色'));
      return;
    }
  }
  const user = await queryOne('SELECT id FROM users WHERE id = $1', [memberUserId]);
  if (!user) {
    res.status(404).json(fail('用户不存在'));
    return;
  }
  const dup = await queryOne(
    'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, memberUserId]
  );
  if (dup) {
    res.status(400).json(fail('该用户已是项目成员'));
    return;
  }
  const member = await queryOne(
    `INSERT INTO project_members (project_id, user_id, project_role, group_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [projectId, memberUserId, projectRole, groupId || null]
  );
  res.json(success(member, '成员添加成功'));
}

/**
 * 更新项目成员角色/分组（总监/该项目经理）
 * PUT /api/projects/:id/members/:memberUserId
 */
export async function updateMember(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const projectId = parseInt(req.params.id, 10);
  const memberUserId = parseInt(req.params.memberUserId, 10);
  const { projectRole, groupId } = req.body || {};
  if (!(await canManageProject(userId, projectId))) {
    res.status(403).json(fail('无权限：仅项目总监或该项目经理可管理成员', 403));
    return;
  }
  const member = await queryOne(
    'SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, memberUserId]
  );
  if (!member) {
    res.status(404).json(fail('该用户不是项目成员'));
    return;
  }
  if (projectRole && !['manager', 'leader', 'member'].includes(projectRole)) {
    res.status(400).json(fail('无效的项目角色'));
    return;
  }
  if (projectRole === 'manager') {
    const existingManager = await queryOne(
      `SELECT user_id FROM project_members WHERE project_id = $1 AND project_role = 'manager' AND user_id != $2`,
      [projectId, memberUserId]
    );
    if (existingManager) {
      res.status(400).json(fail('该项目已有项目经理，请先调整原经理角色'));
      return;
    }
  }
  const updated = await queryOne(
    `UPDATE project_members SET project_role = COALESCE($1, project_role),
       group_id = COALESCE($2, group_id)
     WHERE project_id = $3 AND user_id = $4 RETURNING *`,
    [projectRole || null, groupId === undefined ? member.group_id : groupId, projectId, memberUserId]
  );
  res.json(success(updated, '成员信息更新成功'));
}

/**
 * 移除项目成员（总监/该项目经理）
 * DELETE /api/projects/:id/members/:memberUserId
 */
export async function removeMember(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const projectId = parseInt(req.params.id, 10);
  const memberUserId = parseInt(req.params.memberUserId, 10);
  if (!(await canManageProject(userId, projectId))) {
    res.status(403).json(fail('无权限：仅项目总监或该项目经理可管理成员', 403));
    return;
  }
  await queryOne('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [
    projectId,
    memberUserId,
  ]);
  res.json(success(null, '成员已移除'));
}

/**
 * 创建项目小组（总监/该项目经理）
 * POST /api/projects/:id/groups
 */
export async function createGroup(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const projectId = parseInt(req.params.id, 10);
  const { name, leaderId } = req.body || {};
  if (!(await canManageProject(userId, projectId))) {
    res.status(403).json(fail('无权限：仅项目总监或该项目经理可管理小组', 403));
    return;
  }
  if (!name?.trim()) {
    res.status(400).json(fail('小组名称为必填项'));
    return;
  }
  const group = await queryOne(
    `INSERT INTO project_groups (project_id, name, leader_id) VALUES ($1, $2, $3) RETURNING *`,
    [projectId, name.trim(), leaderId || null]
  );
  // 若指定了组长且其为项目成员，则同步其项目角色为 leader 并归入该组
  if (leaderId) {
    await queryOne(
      `UPDATE project_members SET project_role = 'leader', group_id = $1
       WHERE project_id = $2 AND user_id = $3`,
      [group!.id, projectId, leaderId]
    );
  }
  res.json(success(group, '小组创建成功'));
}

/**
 * 删除项目小组（总监/该项目经理）
 * DELETE /api/projects/:id/groups/:groupId
 */
export async function deleteGroup(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const projectId = parseInt(req.params.id, 10);
  const groupId = parseInt(req.params.groupId, 10);
  if (!(await canManageProject(userId, projectId))) {
    res.status(403).json(fail('无权限：仅项目总监或该项目经理可管理小组', 403));
    return;
  }
  await queryOne('DELETE FROM project_groups WHERE id = $1 AND project_id = $2', [groupId, projectId]);
  res.json(success(null, '小组已删除'));
}
