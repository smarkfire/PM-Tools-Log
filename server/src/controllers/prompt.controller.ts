/**
 * 用户自定义提示词控制器
 * 每个用户可为自己配置不同场景（日志优化/报告生成/AI对话）的提示词
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';

const VALID_TYPES = ['log_optimize', 'report', 'chat'];

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
    if (!VALID_TYPES.includes(type as string)) {
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
  if (!VALID_TYPES.includes(type)) {
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
