/**
 * 提示词服务
 * 统一获取生效提示词的优先级：
 * 1. 用户指定的 promptId（必须是当前用户自己的提示词）
 * 2. 用户的默认提示词（is_default = true）
 * 3. 系统默认提示词（system_prompts，is_active = true）
 */
import { queryOne } from '../config/db';

export type PromptType = 'log_optimize' | 'report' | 'chat';

/**
 * 获取生效的提示词
 * @returns 提示词内容；查不到返回 null
 */
export async function getEffectivePrompt(
  userId: number,
  type: PromptType,
  promptId?: number
): Promise<string | null> {
  // 1. 指定 promptId
  if (promptId) {
    const custom = await queryOne<{ content: string }>(
      `SELECT content FROM user_prompts WHERE id = $1 AND user_id = $2 AND type = $3`,
      [promptId, userId, type]
    );
    if (custom) return custom.content;
  } else {
    // 2. 用户默认提示词
    const def = await queryOne<{ content: string }>(
      `SELECT content FROM user_prompts WHERE user_id = $1 AND type = $2 AND is_default = true`,
      [userId, type]
    );
    if (def) return def.content;
  }

  // 3. 系统默认提示词
  const sys = await queryOne<{ content: string }>(
    `SELECT content FROM system_prompts WHERE type = $1 AND is_active = true ORDER BY id LIMIT 1`,
    [type]
  );
  return sys?.content ?? null;
}

/** 获取系统默认提示词（供前端展示"当前默认"） */
export async function getSystemPrompt(type: PromptType): Promise<string | null> {
  const sys = await queryOne<{ content: string }>(
    `SELECT content FROM system_prompts WHERE type = $1 AND is_active = true ORDER BY id LIMIT 1`,
    [type]
  );
  return sys?.content ?? null;
}
