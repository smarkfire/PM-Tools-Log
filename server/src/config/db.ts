/**
 * PostgreSQL 数据库连接池
 */
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: 20,
  idleTimeoutMillis: 30000,
});

/**
 * 执行 SQL 查询的通用方法
 * @param sql SQL 语句
 * @param params 参数
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query(sql, params) as Promise<QueryResult<T>>;
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
