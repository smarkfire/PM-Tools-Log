/**
 * JWT 认证中间件
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { fail } from '../utils/response';
import { AuthUser } from '../types';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(fail('未登录或 token 缺失', 401));
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, env.jwt.secret) as AuthUser;
    req.authUser = decoded;
    next();
  } catch {
    res.status(401).json(fail('token 无效或已过期', 401));
  }
}
