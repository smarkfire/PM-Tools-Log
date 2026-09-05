/**
 * 应用入口
 */
import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import router from './routes';
import { errorHandler } from './middleware/errorHandler';
import { pool } from './config/db';
import initDb from './scripts/initDb';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 业务路由
app.use('/api', router);

// 404
app.use((_req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// 错误处理
app.use(errorHandler);

async function main() {
  // 启动时确保表结构存在
  await initDb();

  app.listen(env.port, () => {
    console.log(`[Server] 日志管理系统后端已启动: http://localhost:${env.port}`);
    console.log(`[Server] 数据库: ${env.db.host}:${env.db.port}/${env.db.database}`);
  });
}

// 优雅退出
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
