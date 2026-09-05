/**
 * 认证控制器：注册、登录、获取当前用户信息
 */
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne } from '../config/db';
import { env } from '../config/env';
import { success, fail } from '../utils/response';
import { AuthUser, GlobalRole } from '../types';

/**
 * 用户注册
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response) {
  const { username, email, password, displayName } = req.body || {};
  if (!username || !email || !password) {
    res.status(400).json(fail('用户名、邮箱和密码为必填项'));
    return;
  }
  if (password.length < 6) {
    res.status(400).json(fail('密码长度至少6位'));
    return;
  }

  try {
    // 检查重复
    const existing = await queryOne(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (existing) {
      res.status(400).json(fail('用户名或邮箱已被注册'));
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // 第一个注册用户自动成为项目总监，其余默认普通成员
    const cnt = await queryOne<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users');
    const role: GlobalRole = cnt && cnt.cnt === 0 ? 'director' : 'member';

    const user = await queryOne<{ id: number }>(
      `INSERT INTO users (username, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, email, passwordHash, displayName || username, role]
    );

    res.json(success({ id: user!.id, role }, '注册成功'));
  } catch (err) {
    throw err;
  }
}

/**
 * 用户登录
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json(fail('用户名和密码为必填项'));
    return;
  }

  const user = await queryOne<{
    id: number;
    username: string;
    password_hash: string;
    display_name: string;
    role: GlobalRole;
  }>('SELECT id, username, password_hash, display_name, role FROM users WHERE username = $1 OR email = $1', [
    username,
  ]);

  if (!user) {
    res.status(400).json(fail('用户名或密码错误'));
    return;
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(400).json(fail('用户名或密码错误'));
    return;
  }

  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
  const token = jwt.sign(authUser as object, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });

  res.json(success({ token, user: authUser }, '登录成功'));
}

/**
 * 获取当前登录用户信息（含项目角色概览）
 * GET /api/auth/me
 */
export async function me(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const user = await queryOne(
    `SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at,
            COALESCE(
              (SELECT json_agg(json_build_object(
                'projectId', pm.project_id,
                'projectName', p.name,
                'projectRole', pm.project_role,
                'groupId', pm.group_id,
                'groupName', pg.name
              ))
              FROM project_members pm
              JOIN projects p ON p.id = pm.project_id
              LEFT JOIN project_groups pg ON pg.id = pm.group_id
              WHERE pm.user_id = u.id), '[]'::json
            ) AS memberships
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  if (!user) {
    res.status(404).json(fail('用户不存在'));
    return;
  }
  res.json(success(user));
}

/**
 * 修改密码
 * PUT /api/auth/password
 */
export async function changePassword(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    res.status(400).json(fail('旧密码和新密码为必填项'));
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json(fail('新密码长度至少6位'));
    return;
  }
  const user = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );
  if (!user || !(await bcrypt.compare(oldPassword, user.password_hash))) {
    res.status(400).json(fail('旧密码错误'));
    return;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await queryOne('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
  res.json(success(null, '密码修改成功'));
}
