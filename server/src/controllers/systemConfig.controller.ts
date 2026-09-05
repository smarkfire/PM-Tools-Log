/**
 * 系统配置控制器
 *
 * 包含三部分：
 * 1. 管理员系统设置：AI Key（系统默认）、Base URL、模型、菜单开关
 * 2. 用户 AI 配置：用户自己的 API Key（优先于系统 Key）
 * 3. 菜单可见性：根据管理员开关 + 用户角色返回可见菜单（供前端侧边栏使用）
 */
import { Request, Response } from 'express';
import { queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { getAllConfig, setConfig, getUserAiConfig } from '../services/config.service';

/** 需要管理员权限的接口统一在此校验 */
async function requireDirector(req: Request, res: Response): Promise<boolean> {
  const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [
    req.authUser!.id,
  ]);
  if (!user || user.role !== 'director') {
    res.status(403).json(fail('无权限：仅项目总监可操作系统设置', 403));
    return false;
  }
  return true;
}

/** 允许普通管理员（管理员视图）读取的 Key 脱敏显示 */
function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

// ==================== 管理员：系统设置 ====================

/**
 * 获取系统配置（仅管理员）
 * GET /api/admin/config
 */
export async function getAdminConfig(req: Request, res: Response) {
  if (!(await requireDirector(req, res))) return;

  const config = await getAllConfig();

  // AI Key 脱敏 + 标记是否来自 .env
  const result: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith('_api_key')) {
      result[key] = maskKey(value);
      result[`${key}__set`] = !!value;
    } else {
      result[key] = value;
    }
  }
  res.json(success(result));
}

/**
 * 更新系统配置（仅管理员）
 * PUT /api/admin/config
 * body: { qwen_api_key?, qwen_base_url?, qwen_model?, menu_xxx?, ... }
 */
export async function updateAdminConfig(req: Request, res: Response) {
  if (!(await requireDirector(req, res))) return;

  const body = req.body || {};
  const allowedKeys = [
    // AI 配置
    'qwen_api_key',
    'qwen_base_url',
    'qwen_model',
    'deepseek_api_key',
    'deepseek_base_url',
    'deepseek_model',
    // 菜单开关
    'menu_logs_write',
    'menu_logs',
    'menu_logs_all',
    'menu_projects',
    'menu_reports',
    'menu_chat',
    'menu_prompts',
    'menu_users',
    'menu_ai_settings',
  ];
  const updates = Object.entries(body).filter(([k]) => allowedKeys.includes(k));
  if (updates.length === 0) {
    res.status(400).json(fail('没有可更新的配置项'));
    return;
  }

  for (const [key, value] of updates) {
    // 菜单开关统一存 'true'/'false' 字符串
    if (key.startsWith('menu_')) {
      await setConfig(key, value === true || value === 'true' ? 'true' : 'false');
    } else {
      await setConfig(key, value == null ? '' : String(value));
    }
  }
  res.json(success(null, `已更新 ${updates.length} 项配置`));
}

// ==================== 用户：AI 配置 ====================

/**
 * 获取当前用户的 AI 配置（脱敏）
 * GET /api/ai-config
 */
export async function getMyAiConfig(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const cfg = await getUserAiConfig(userId);
  const row = await queryOne<{
    qwen_api_key: string | null;
    deepseek_api_key: string | null;
    preferred_provider: string;
  }>('SELECT qwen_api_key, deepseek_api_key, preferred_provider FROM user_ai_config WHERE user_id = $1', [
    userId,
  ]);

  res.json(
    success({
      // 用户自己已保存的 Key（脱敏显示）
      qwenApiKey: maskKey(row?.qwen_api_key || ''),
      qwenKeySet: !!row?.qwen_api_key,
      deepseekApiKey: maskKey(row?.deepseek_api_key || ''),
      deepseekKeySet: !!row?.deepseek_api_key,
      preferredProvider: row?.preferred_provider || 'qwen',
      // 当前实际生效的 Key 来源（user/system/env/none）
      effectiveSource: {
        qwen: cfg.qwen.keySource,
        deepseek: cfg.deepseek.keySource,
      },
      // 当前生效的 baseUrl/model（方便用户了解）
      effective: {
        qwen: { baseUrl: cfg.qwen.baseUrl, model: cfg.qwen.model },
        deepseek: { baseUrl: cfg.deepseek.baseUrl, model: cfg.deepseek.model },
      },
    })
  );
}

/**
 * 更新当前用户的 AI 配置
 * PUT /api/ai-config
 * body: { qwenApiKey?, deepseekApiKey?, preferredProvider? }
 * 说明：传空字符串表示清除该 Key（回退到系统默认）；传 null/undefined 表示不修改
 */
export async function updateMyAiConfig(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { qwenApiKey, deepseekApiKey, preferredProvider } = req.body || {};

  const existing = await queryOne(
    'SELECT user_id FROM user_ai_config WHERE user_id = $1',
    [userId]
  );

  // 处理逻辑：undefined → 保留原值；字符串（含空）→ 覆盖（空=清除）
  const merge = (oldVal: string | null | undefined, newVal: string | undefined): string | null => {
    if (newVal === undefined) return oldVal ?? null;
    const trimmed = String(newVal).trim();
    return trimmed === '' ? null : trimmed;
  };

  const old = existing
    ? await queryOne<{ qwen_api_key: string | null; deepseek_api_key: string | null }>(
        'SELECT qwen_api_key, deepseek_api_key FROM user_ai_config WHERE user_id = $1',
        [userId]
      )
    : null;

  const newQwen = merge(old?.qwen_api_key, qwenApiKey);
  const newDeepseek = merge(old?.deepseek_api_key, deepseekApiKey);
  const provider = preferredProvider === 'deepseek' ? 'deepseek' : 'qwen';

  if (existing) {
    await queryOne(
      `UPDATE user_ai_config
       SET qwen_api_key = $1, deepseek_api_key = $2, preferred_provider = $3, updated_at = NOW()
       WHERE user_id = $4`,
      [newQwen, newDeepseek, provider, userId]
    );
  } else {
    await queryOne(
      `INSERT INTO user_ai_config (user_id, qwen_api_key, deepseek_api_key, preferred_provider)
       VALUES ($1, $2, $3, $4)`,
      [userId, newQwen, newDeepseek, provider]
    );
  }
  res.json(success(null, 'AI 配置已保存'));
}

// ==================== 菜单可见性 ====================

/**
 * 获取当前用户的可见菜单配置（结合管理员开关）
 * GET /api/config/menus
 */
export async function getVisibleMenus(req: Request, res: Response) {
  const config = await getAllConfig();
  res.json(
    success({
      // 全部开关（true/false），前端据此显示/隐藏菜单
      menus: {
        logsWrite: config.menu_logs_write !== 'false',
        logs: config.menu_logs !== 'false',
        logsAll: config.menu_logs_all !== 'false',
        projects: config.menu_projects !== 'false',
        reports: config.menu_reports !== 'false',
        chat: config.menu_chat !== 'false',
        prompts: config.menu_prompts !== 'false',
        users: config.menu_users !== 'false',
        aiSettings: config.menu_ai_settings !== 'false',
      },
    })
  );
}
