/**
 * 全局错误处理中间件
 */
import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  // 透传业务错误信息（如 AI 未配置、AI 接口调用失败等）
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误' });
}
