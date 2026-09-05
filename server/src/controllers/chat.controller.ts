/**
 * AI 对话控制器
 *
 * 数据权限说明：
 * AI 对话中注入的工作日志上下文严格遵循当前用户的数据范围：
 * - 项目总监：可基于全部日志对话
 * - 项目经理：可基于所管辖项目的日志对话
 * - 小组长：可基于本小组的日志对话
 * - 组员：仅基于自己的日志对话
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { getDataScope } from '../services/permission.service';
import { chat, AiProvider, ChatMessage } from '../services/ai.service';
import { getUserAiConfig } from '../services/config.service';
import { getEffectivePrompt } from '../services/prompt.service';
import { env } from '../config/env';

/**
 * 构建用户数据范围内的日志上下文
 */
async function buildLogContext(userId: number): Promise<string> {
  const scope = await getDataScope(userId);
  const params: any[] = [];
  const conditions: string[] = [];
  if (scope.type !== 'all') {
    params.push(scope.userIds);
    conditions.push(`wl.user_id = ANY($${params.length}::int[])`);
  }
  // 仅取最近30天、最多 N 条
  params.push(env.ai.contextMaxLogs);
  const limitIdx = params.length;
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const logs = await queryMany(
    `SELECT wl.log_date, u.display_name AS user_name, p.name AS project_name,
            COALESCE(wl.optimized_content, wl.content) AS content, wl.hours
     FROM work_logs wl
     JOIN users u ON u.id = wl.user_id
     LEFT JOIN projects p ON p.id = wl.project_id
     ${whereClause}
     ORDER BY wl.log_date DESC
     LIMIT $${limitIdx}`,
    params
  );
  if (logs.length === 0) {
    return '（当前用户数据范围内暂无工作日志记录）';
  }
  const lines = logs
    .map(
      (l) =>
        `- [${l.log_date}] ${l.user_name}${l.project_name ? `@${l.project_name}` : ''} (${l.hours || '-'}h): ${l.content.slice(0, 500)}`
    )
    .join('\n');
  const scopeDesc =
    scope.type === 'all'
      ? '全部项目（项目总监权限）'
      : scope.type === 'project'
        ? '所管辖的项目'
        : scope.type === 'group'
          ? '所在小组'
          : '本人';
  return `当前用户的数据权限范围：${scopeDesc}\n最近日志记录：\n${lines}`;
}

/**
 * 获取对话列表
 * GET /api/chat/conversations
 */
export async function listConversations(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const conversations = await queryMany(
    'SELECT * FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50',
    [userId]
  );
  res.json(success(conversations));
}

/**
 * 创建对话
 * POST /api/chat/conversations
 */
export async function createConversation(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { title, provider } = req.body || {};
  const conversation = await queryOne(
    `INSERT INTO ai_conversations (user_id, title, provider)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, title || '新对话', provider === 'deepseek' ? 'deepseek' : 'qwen']
  );
  res.json(success(conversation, '对话创建成功'));
}

/**
 * 删除对话
 * DELETE /api/chat/conversations/:id
 */
export async function deleteConversation(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const conversationId = parseInt(req.params.id, 10);
  const conv = await queryOne(
    'SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  if (!conv) {
    res.status(404).json(fail('对话不存在'));
    return;
  }
  await queryOne('DELETE FROM ai_conversations WHERE id = $1', [conversationId]);
  res.json(success(null, '对话已删除'));
}

/**
 * 获取对话消息
 * GET /api/chat/conversations/:id/messages
 */
export async function getMessages(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const conversationId = parseInt(req.params.id, 10);
  const conv = await queryOne(
    'SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  if (!conv) {
    res.status(404).json(fail('对话不存在'));
    return;
  }
  const messages = await queryMany(
    'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY id',
    [conversationId]
  );
  res.json(success(messages));
}

/**
 * 发送消息并获取 AI 回复
 * POST /api/chat/conversations/:id/messages
 * body: { content, provider?, promptId? }
 */
export async function sendMessage(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const conversationId = parseInt(req.params.id, 10);
  const { content, provider, promptId } = req.body || {};
  if (!content?.trim()) {
    res.status(400).json(fail('消息内容不能为空'));
    return;
  }
  const conv = await queryOne<{ id: number; provider: string }>(
    'SELECT id, provider FROM ai_conversations WHERE id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  if (!conv) {
    res.status(404).json(fail('对话不存在'));
    return;
  }
  const aiProvider: AiProvider =
    provider === 'deepseek' ? 'deepseek' : provider === 'qwen' ? 'qwen' : (conv.provider as AiProvider);

  // 保存用户消息
  await queryOne(
    `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [conversationId, content.trim()]
  );

  // 构建消息列表（含历史）
  const history = await queryMany<{ role: string; content: string }>(
    'SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 20',
    [conversationId]
  );
  history.reverse();

  // 系统提示词：指定 promptId > 用户默认 > 系统默认
  const systemPrompt = (await getEffectivePrompt(userId, 'chat', promptId)) || '';
  if (!systemPrompt) {
    res.status(500).json(fail('系统提示词未配置，请联系管理员初始化系统默认提示词'));
    return;
  }

  const logContext = await buildLogContext(userId);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n=== 日志数据上下文（仅限当前用户数据权限范围） ===\n${logContext}`,
    },
    ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
  ];

  // 调用 AI（Key 优先级：用户自己的 > 系统配置 > .env）
  const userAiConfig = await getUserAiConfig(userId);
  const reply = await chat(aiProvider, messages, {
    override: aiProvider === 'qwen' ? userAiConfig.qwen : userAiConfig.deepseek,
  });

  // 保存 AI 回复
  const assistantMsg = await queryOne(
    `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2) RETURNING *`,
    [conversationId, reply]
  );

  // 更新对话时间与标题（首条消息时）
  const msgCount = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*)::int AS cnt FROM ai_messages WHERE conversation_id = $1',
    [conversationId]
  );
  if (msgCount && msgCount.cnt <= 2) {
    await queryOne(
      `UPDATE ai_conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
      [content.trim().slice(0, 30), conversationId]
    );
  } else {
    await queryOne('UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
  }

  res.json(success({ reply: assistantMsg, provider: aiProvider }));
}

/**
 * 获取 AI 提供商可用状态（基于当前用户的 Key：用户自己的 > 系统配置 > .env）
 * GET /api/chat/providers
 */
export async function getProviders(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const userAiConfig = await getUserAiConfig(userId);
  const providers: string[] = [];
  if (userAiConfig.qwen.apiKey) providers.push('qwen');
  if (userAiConfig.deepseek.apiKey) providers.push('deepseek');
  res.json(
    success({
      providers,
      qwenConfigured: providers.includes('qwen'),
      deepseekConfigured: providers.includes('deepseek'),
      keySource: {
        qwen: userAiConfig.qwen.keySource,
        deepseek: userAiConfig.deepseek.keySource,
      },
    })
  );
}
