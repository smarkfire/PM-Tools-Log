/**
 * 异步处理器包装：将 async 控制器的异常传递给错误中间件
 * （Express 4 不会自动捕获 async 函数的 rejection）
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
