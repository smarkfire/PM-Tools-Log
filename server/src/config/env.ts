/**
 * 环境变量配置
 * 支持：
 *  - 分离变量（DB_HOST/DB_PORT/...），适合本地开发
 *  - DATABASE_URL 单一连接串（Vercel/Supabase 部署推荐），形如
 *    postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
 */
import dotenv from 'dotenv';
dotenv.config();

/** 是否 Serverless 环境（Vercel） */
export const isServerless = !!process.env.VERCEL;

/** 解析 DATABASE_URL 中的主机（用于判断是否启用 SSL） */
function parseHost(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isServerless,
  db: {
    // DATABASE_URL 优先
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'logadmin',
    password: process.env.DB_PASSWORD || 'logadmin123',
    database: process.env.DB_NAME || 'logdb',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-jwt-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  // 部署后远程初始化数据库的密钥（POST /api/setup，请求头 X-Setup-Key）
  setupKey: process.env.SETUP_KEY || '',
  ai: {
    qwen: {
      apiKey: process.env.QWEN_API_KEY || '',
      baseUrl: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: process.env.QWEN_MODEL || 'qwen-plus',
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
    contextMaxLogs: parseInt(process.env.AI_CONTEXT_MAX_LOGS || '50', 10),
    // AI 请求超时（毫秒）。Vercel 等 Serverless 平台建议设为 50000 以内
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '120000', 10),
  },
};

/** 数据库连接是否需要 SSL（Supabase/云数据库需要，本地不需要） */
export function dbNeedsSSL(): boolean {
  const host = env.db.url ? parseHost(env.db.url) : env.db.host;
  return !!host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
}
