/**
 * 系统配置服务
 * - 读取/写入 system_config 表（管理员可配置）
 * - 解析用户可用的 AI 配置：用户自己的 Key（user_ai_config）> 系统配置（system_config）> .env 兜底
 */
import { queryOne, queryMany } from '../config/db';
import { env } from '../config/env';

/** 读取全部系统配置为 key-value 映射 */
export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await queryMany<{ config_key: string; config_value: string | null }>(
    'SELECT config_key, config_value FROM system_config'
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.config_key] = r.config_value ?? '';
  return map;
}

/** 读取单个配置 */
export async function getConfig(key: string): Promise<string | null> {
  const row = await queryOne<{ config_value: string | null }>(
    'SELECT config_value FROM system_config WHERE config_key = $1',
    [key]
  );
  return row?.config_value ?? null;
}

/** 写入配置（upsert） */
export async function setConfig(key: string, value: string): Promise<void> {
  await queryOne(
    `INSERT INTO system_config (config_key, config_value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Key 来源：user(用户自配) / system(管理员配置) / env(.env) / none(未配置) */
  keySource: 'user' | 'system' | 'env' | 'none';
}

export interface UserAiConfig {
  qwen: ProviderConfig;
  deepseek: ProviderConfig;
}

/**
 * 获取指定用户可用的 AI 配置
 * 优先级：用户自己的 Key > 系统配置 Key > .env 环境变量
 */
export async function getUserAiConfig(userId?: number): Promise<UserAiConfig> {
  const sys = await getAllConfig();

  let userKeys: { qwen_api_key?: string | null; deepseek_api_key?: string | null } = {};
  if (userId) {
    userKeys = (await queryOne<{ qwen_api_key: string | null; deepseek_api_key: string | null }>(
      'SELECT qwen_api_key, deepseek_api_key FROM user_ai_config WHERE user_id = $1',
      [userId]
    )) || {};
  }

  const resolve = (
    provider: 'qwen' | 'deepseek'
  ): ProviderConfig => {
    const envCfg = provider === 'qwen' ? env.ai.qwen : env.ai.deepseek;
    const sysKey = sys[`${provider}_api_key`] || '';
    const sysBaseUrl = sys[`${provider}_base_url`] || '';
    const sysModel = sys[`${provider}_model`] || '';
    const userKey = (provider === 'qwen' ? userKeys.qwen_api_key : userKeys.deepseek_api_key) || '';

    let apiKey = '';
    let keySource: ProviderConfig['keySource'] = 'none';
    if (userKey) {
      apiKey = userKey;
      keySource = 'user';
    } else if (sysKey) {
      apiKey = sysKey;
      keySource = 'system';
    } else if (envCfg.apiKey) {
      apiKey = envCfg.apiKey;
      keySource = 'env';
    }

    return {
      apiKey,
      baseUrl: sysBaseUrl || envCfg.baseUrl,
      model: sysModel || envCfg.model,
      keySource,
    };
  };

  return { qwen: resolve('qwen'), deepseek: resolve('deepseek') };
}
