/**
 * 用户自定义提示词控制器
 * 每个用户可为自己配置不同场景（日志优化/报告生成/AI对话）的提示词
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { setConfig } from '../services/config.service';

/** 普通用户可自建提示词的类型 */
const USER_PROMPT_TYPES = ['log_optimize', 'report', 'chat'];
/** 系统默认提示词类型（log_review 仅系统项；log_template 仅用于填报页气泡展示） */
const SYSTEM_PROMPT_TYPES = ['log_optimize', 'log_review', 'report', 'chat', 'log_template'];
/** 管理员手工定制标记前缀（与 initDb 保持一致，存在时不再被种子覆盖） */
const PROMPT_CUSTOMIZED_KEY_PREFIX = 'sp_customized_';

/**
 * 获取当前用户的提示词列表（附系统默认提示词）
 * GET /api/prompts?type=
 */
export async function listPrompts(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { type } = req.query;
  const params: any[] = [userId];
  let sql = 'SELECT * FROM user_prompts WHERE user_id = $1';
  if (type) {
    if (!SYSTEM_PROMPT_TYPES.includes(type as string)) {
      res.status(400).json(fail('无效的提示词类型'));
      return;
    }
    params.push(type);
    sql += ` AND type = $${params.length}`;
  }
  sql += ' ORDER BY id DESC';
  const prompts = await queryMany(sql, params);

  // 系统默认提示词（当前生效的兜底配置）
  const sysParams: any[] = [];
  let sysSql = 'SELECT id, type, name, content FROM system_prompts WHERE is_active = true';
  if (type) {
    sysParams.push(type);
    sysSql += ` AND type = $${sysParams.length}`;
  }
  const systemPrompts = await queryMany(sysSql, sysParams);

  // 是否已有自定义默认（决定系统默认是否生效）
  const hasCustomDefault = prompts.some((p: any) => p.is_default);
  res.json(success({ prompts, systemPrompts, hasCustomDefault }));
}

/**
 * 创建提示词
 * POST /api/prompts
 */
export async function createPrompt(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { type, name, content, isDefault } = req.body || {};
  if (!USER_PROMPT_TYPES.includes(type)) {
    res.status(400).json(fail('无效的提示词类型'));
    return;
  }
  if (!name?.trim() || !content?.trim()) {
    res.status(400).json(fail('提示词名称和内容为必填项'));
    return;
  }
  // 设为默认时，取消同类型其他默认
  if (isDefault) {
    await queryOne(
      `UPDATE user_prompts SET is_default = false WHERE user_id = $1 AND type = $2`,
      [userId, type]
    );
  }
  const prompt = await queryOne(
    `INSERT INTO user_prompts (user_id, type, name, content, is_default)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, name.trim(), content.trim(), !!isDefault]
  );
  res.json(success(prompt, '提示词创建成功'));
}

/**
 * 更新提示词
 * PUT /api/prompts/:id
 */
export async function updatePrompt(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const promptId = parseInt(req.params.id, 10);
  const { name, content, isDefault } = req.body || {};
  const existing = await queryOne(
    'SELECT * FROM user_prompts WHERE id = $1 AND user_id = $2',
    [promptId, userId]
  );
  if (!existing) {
    res.status(404).json(fail('提示词不存在'));
    return;
  }
  if (isDefault) {
    await queryOne(
      `UPDATE user_prompts SET is_default = false WHERE user_id = $1 AND type = $2`,
      [userId, existing.type]
    );
  }
  const updated = await queryOne(
    `UPDATE user_prompts SET name = COALESCE($1, name), content = COALESCE($2, content),
       is_default = COALESCE($3, is_default), updated_at = NOW()
     WHERE id = $4 AND user_id = $5 RETURNING *`,
    [name, content, isDefault === undefined ? null : isDefault, promptId, userId]
  );
  res.json(success(updated, '提示词更新成功'));
}

/**
 * 删除提示词
 * DELETE /api/prompts/:id
 */
export async function deletePrompt(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const promptId = parseInt(req.params.id, 10);
  const existing = await queryOne(
    'SELECT id FROM user_prompts WHERE id = $1 AND user_id = $2',
    [promptId, userId]
  );
  if (!existing) {
    res.status(404).json(fail('提示词不存在'));
    return;
  }
  await queryOne('DELETE FROM user_prompts WHERE id = $1', [promptId, userId]);
  res.json(success(null, '提示词已删除'));
}

// ==================== 系统默认提示词（仅系统管理员可改） ====================

/** 仅系统管理员（role = 'admin'）可修改系统默认提示词；项目总监等角色不可修改 */
async function requireSystemAdmin(req: Request, res: Response): Promise<boolean> {
  const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [
    req.authUser!.id,
  ]);
  if (!user || user.role !== 'admin') {
    res.status(403).json(fail('无权限：仅系统管理员可修改系统默认提示词', 403));
    return false;
  }
  return true;
}

/**
 * 更新系统默认提示词
 * PUT /api/system-prompts/:id
 * body: { name?, content }
 * 保存后写入 sp_customized_<type> 标记，避免后续启动被种子覆盖
 */
export async function updateSystemPrompt(req: Request, res: Response) {
  if (!(await requireSystemAdmin(req, res))) return;

  const promptId = parseInt(req.params.id, 10);
  if (!Number.isInteger(promptId)) {
    res.status(400).json(fail('无效的提示词 ID'));
    return;
  }

  const { name, content } = req.body || {};
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json(fail('提示词内容不能为空'));
    return;
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    res.status(400).json(fail('提示词名称不能为空'));
    return;
  }

  const existing = await queryOne<{ id: number; type: string }>(
    'SELECT id, type FROM system_prompts WHERE id = $1',
    [promptId]
  );
  if (!existing) {
    res.status(404).json(fail('系统提示词不存在'));
    return;
  }
  if (!SYSTEM_PROMPT_TYPES.includes(existing.type)) {
    res.status(400).json(fail('该类型不支持在页面修改'));
    return;
  }

  const updated = await queryOne(
    `UPDATE system_prompts
     SET name = COALESCE($1, name), content = $2
     WHERE id = $3
     RETURNING id, type, name, content`,
    [typeof name === 'string' ? name.trim() : null, content.trim(), promptId]
  );

  // 标记该类型已被管理员定制，initDb 后续不再用种子覆盖
  await setConfig(`${PROMPT_CUSTOMIZED_KEY_PREFIX}${existing.type}`, '1');

  res.json(success(updated, '系统提示词已更新'));
}
