/**
 * Vercel Serverless Function 入口
 * 将 Express 应用导出为单个 Vercel Function，由根目录 vercel.json 的
 * rewrites 将 /api/* 请求路由到这里（Express 收到的是原始路径）
 */
import app from '../server/src/app';

export default app;
