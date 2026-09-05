/**
 * Express 应用（与监听分离，便于 Vercel Serverless 复用）
 */
import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import router from './routes';
import { errorHandler } from './middleware/errorHandler';
import initDb from './scripts/initDb';
import { success, fail } from './utils/response';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * 远程数据库初始化（幂等）：建表 + 种子数据
 * 用于部署到 Vercel 后初始化 Supabase 数据库
 * POST /api/setup，请求头 X-Setup-Key 与环境变量 SETUP_KEY 匹配
 */
app.post('/api/setup', async (req, res) => {
  const key = req.headers['x-setup-key'];
  if (!env.setupKey) {
    res.status(503).json(fail('未配置 SETUP_KEY 环境变量，禁止远程初始化', 503));
    return;
  }
  if (key !== env.setupKey) {
    res.status(403).json(fail('初始化密钥错误', 403));
    return;
  }
  try {
    await initDb();
    res.json(success(null, '数据库初始化完成（表结构与种子数据已就绪）'));
  } catch (err) {
    res.status(500).json(fail(`初始化失败: ${(err as Error).message}`, 500));
  }
});

// 业务路由
app.use('/api', router);

// 404
app.use((_req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// 错误处理
app.use(errorHandler);

export default app;
