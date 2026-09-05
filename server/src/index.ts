/**
 * 应用入口
 * - 本地开发：初始化数据库并监听端口
 * - Vercel Serverless：仅导出 app（实际入口为根目录 api/index.ts）
 */
import app from './app';
import { env } from './config/env';
import { pool } from './config/db';
import initDb from './scripts/initDb';

if (!env.isServerless) {
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
}

export default app;
