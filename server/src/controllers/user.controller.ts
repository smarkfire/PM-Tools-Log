/**
 * 用户管理控制器（项目总监专用）
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { isDirector } from '../services/permission.service';
import { GlobalRole } from '../types';

const VALID_ROLES: GlobalRole[] = ['director', 'manager', 'leader', 'member'];

/**
 * 获取用户列表（仅总监）
 * GET /api/users
 */
export async function listUsers(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  if (!(await isDirector(currentUserId))) {
    res.status(403).json(fail('无权限：仅项目总监可查看用户列表', 403));
    return;
  }
  const keyword = (req.query.keyword as string || '').trim();
  let sql = `
    SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at,
      COALESCE(
        (SELECT json_agg(json_build_object(
          'projectId', pm.project_id, 'projectName', p.name,
          'projectRole', pm.project_role, 'groupId', pm.group_id, 'groupName', pg.name
        ))
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        LEFT JOIN project_groups pg ON pg.id = pm.group_id
        WHERE pm.user_id = u.id), '[]'::json
      ) AS memberships
    FROM users u`;
  const params: any[] = [];
  if (keyword) {
    params.push(`%${keyword}%`);
    sql += ` WHERE u.username LIKE $1 OR u.display_name LIKE $1 OR u.email LIKE $1`;
  }
  sql += ` ORDER BY u.id`;
  const users = await queryMany(sql, params);
  res.json(success(users));
}

/**
 * 更新用户全局角色（仅总监）
 * PUT /api/users/:id/role
 */
export async function updateUserRole(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  if (!(await isDirector(currentUserId))) {
    res.status(403).json(fail('无权限：仅项目总监可修改用户角色', 403));
    return;
  }
  const targetId = parseInt(req.params.id, 10);
  const { role } = req.body || {};
  if (!VALID_ROLES.includes(role)) {
    res.status(400).json(fail('无效的角色类型'));
    return;
  }
  if (targetId === currentUserId && role !== 'director') {
    res.status(400).json(fail('不能降级自己的总监角色'));
    return;
  }
  const user = await queryOne('SELECT id FROM users WHERE id = $1', [targetId]);
  if (!user) {
    res.status(404).json(fail('用户不存在'));
    return;
  }
  await queryOne('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, targetId]);
  res.json(success(null, '角色更新成功'));
}

/**
 * 获取可选成员列表（项目添加成员时用，搜索未加入项目的用户）
 * GET /api/users/available?projectId=1&keyword=xxx
 */
export async function listAvailableUsers(req: Request, res: Response) {
  const projectId = parseInt(req.query.projectId as string, 10);
  const keyword = (req.query.keyword as string || '').trim();
  if (!projectId) {
    res.status(400).json(fail('缺少项目ID'));
    return;
  }
  let sql = `
    SELECT u.id, u.username, u.display_name, u.email
    FROM users u
    WHERE NOT EXISTS (
      SELECT 1 FROM project_members pm WHERE pm.user_id = u.id AND pm.project_id = $1
    )`;
  const params: any[] = [projectId];
  if (keyword) {
    params.push(`%${keyword}%`);
    sql += ` AND (u.username LIKE $2 OR u.display_name LIKE $2 OR u.email LIKE $2)`;
  }
  sql += ` ORDER BY u.id LIMIT 50`;
  const users = await queryMany(sql, params);
  res.json(success(users));
}
