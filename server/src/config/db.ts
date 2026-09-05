/**
 * PostgreSQL 数据库连接池
 * - 本地开发：DB_HOST 等分离变量
 * - 云部署（Vercel + Supabase）：DATABASE_URL 连接串，自动启用 SSL
 * - Serverless 环境使用小连接池 + 短空闲超时，并针对冻结后失效连接做一次重试
 */
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env, dbNeedsSSL } from './env';

const useSSL = dbNeedsSSL();

export const pool = new Pool(
  env.db.url
    ? {
        connectionString: env.db.url,
        ssl: useSSL ? { rejectUnauthorized: false } : undefined,
        // Serverless：每个函数实例持有少量连接；本地开发可放宽
        max: env.isServerless ? 3 : 20,
        idleTimeoutMillis: env.isServerless ? 10000 : 30000,
        connectionTimeoutMillis: 15000,
      }
    : {
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: env.db.database,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
      }
);

/** 判断是否为连接类错误（Serverless 实例冻结后连接失效的典型场景） */
function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (!e) return false;
  const codes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', '57P01', '57P03', '53300'];
  const msgs = ['Connection terminated', 'server closed the connection', 'connection ended'];
  return (
    (e.code && codes.includes(e.code)) ||
    (!!e.message && msgs.some((m) => e.message!.includes(m)))
  );
}

/**
 * 执行 SQL 查询的通用方法
 * @param sql SQL 语句
 * @param params 参数
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: any[]
): Promise<QueryResult<T>> {
  try {
    return (await pool.query(sql, params)) as QueryResult<T>;
  } catch (err) {
    // Serverless 冻结后复用失效连接是暂态错误：丢弃旧连接重试一次
    if (env.isServerless && isConnectionError(err)) {
      return (await pool.query(sql, params)) as QueryResult<T>;
    }
    throw err;
  }
}

/**
 * 获取单行结果
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const res = await query<T>(sql, params);
  return res.rows[0] || null;
}

/**
 * 获取多行结果
 */
export async function queryMany<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const res = await query<T>(sql, params);
  return res.rows;
}
