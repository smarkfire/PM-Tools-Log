/**
 * 工作日志控制器
 *
 * 权限规则（数据范围）：
 * - 项目总监：查看所有日志
 * - 项目经理：查看所管辖项目全部成员的日志
 * - 小组长：查看本小组成员的日志
 * - 组员：仅查看自己的日志
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { getDataScope } from '../services/permission.service';
import { chat, AiProvider } from '../services/ai.service';
import { getUserAiConfig } from '../services/config.service';
import { getEffectivePrompt } from '../services/prompt.service';

/**
 * 查询日志列表（按数据权限过滤）
 * GET /api/logs?projectId=&userId=&startDate=&endDate=&keyword=&page=&pageSize=
 */
export async function listLogs(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const scope = await getDataScope(currentUserId);

  const conditions: string[] = [];
  const params: any[] = [];

  // 数据权限过滤
  if (scope.type !== 'all') {
    params.push(scope.userIds);
    conditions.push(`wl.user_id = ANY($${params.length}::int[])`);
  }

  const { projectId, userId, startDate, endDate, keyword, page, pageSize } = req.query;
  if (projectId) {
    params.push(parseInt(projectId as string, 10));
    conditions.push(`wl.project_id = $${params.length}`);
  }
  if (userId) {
    // 查看指定用户日志前先校验权限
    const targetUserId = parseInt(userId as string, 10);
    if (targetUserId !== currentUserId && !(scope.userIds?.includes(targetUserId) || scope.type === 'all')) {
      res.status(403).json(fail('无权限查看该用户的日志', 403));
      return;
    }
    params.push(targetUserId);
    conditions.push(`wl.user_id = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    conditions.push(`wl.log_date >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`wl.log_date <= $${params.length}`);
  }
  if (keyword) {
    params.push(`%${keyword}%`);
    conditions.push(`(wl.content ILIKE $${params.length} OR wl.optimized_content ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(1, parseInt((page as string) || '1', 10));
  const size = Math.min(100, Math.max(1, parseInt((pageSize as string) || '20', 10)));

  const totalRes = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM work_logs wl ${whereClause}`,
    params
  );
  const logs = await queryMany(
    `SELECT wl.*, u.display_name AS user_name, u.username, p.name AS project_name
     FROM work_logs wl
     JOIN users u ON u.id = wl.user_id
     LEFT JOIN projects p ON p.id = wl.project_id
     ${whereClause}
     ORDER BY wl.log_date DESC, wl.id DESC
     LIMIT ${size} OFFSET ${(pageNum - 1) * size}`,
    params
  );

  res.json(success({ list: logs, total: totalRes?.cnt || 0, page: pageNum, pageSize: size }));
}

/**
 * 获取日志详情
 * GET /api/logs/:id
 */
export async function getLog(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const logId = parseInt(req.params.id, 10);
  const log = await queryOne(
    `SELECT wl.*, u.display_name AS user_name, p.name AS project_name
     FROM work_logs wl JOIN users u ON u.id = wl.user_id
     LEFT JOIN projects p ON p.id = wl.project_id
     WHERE wl.id = $1`,
    [logId]
  );
  if (!log) {
    res.status(404).json(fail('日志不存在'));
    return;
  }
  const scope = await getDataScope(currentUserId);
  if (scope.type !== 'all' && !scope.userIds?.includes(log.user_id)) {
    res.status(403).json(fail('无权限查看该日志', 403));
    return;
  }
  res.json(success(log));
}

/**
 * 创建/更新日志（仅限本人，一天一篇，重复提交则更新）
 * POST /api/logs
 */
export async function saveLog(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { logDate, projectId, content, optimizedContent, aiProvider, hours } = req.body || {};
  if (!logDate || !content?.trim()) {
    res.status(400).json(fail('日志日期和内容为必填项'));
    return;
  }
  const existing = await queryOne(
    'SELECT id FROM work_logs WHERE user_id = $1 AND log_date = $2',
    [userId, logDate]
  );
  if (existing) {
    const updated = await queryOne(
      `UPDATE work_logs SET content = $1, optimized_content = $2, ai_provider = $3,
         hours = $4, project_id = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [content, optimizedContent || null, aiProvider || null, hours || null, projectId || null, existing.id]
    );
    res.json(success(updated, '日志已更新'));
    return;
  }
  const created = await queryOne(
    `INSERT INTO work_logs (user_id, project_id, log_date, content, optimized_content, ai_provider, hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, projectId || null, logDate, content, optimizedContent || null, aiProvider || null, hours || null]
  );
  res.json(success(created, '日志提交成功'));
}

/**
 * 删除日志（仅限本人）
 * DELETE /api/logs/:id
 */
export async function deleteLog(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const logId = parseInt(req.params.id, 10);
  const log = await queryOne('SELECT user_id FROM work_logs WHERE id = $1', [logId]);
  if (!log) {
    res.status(404).json(fail('日志不存在'));
    return;
  }
  if (log.user_id !== userId) {
    res.status(403).json(fail('只能删除自己的日志'));
    return;
  }
  await queryOne('DELETE FROM work_logs WHERE id = $1', [logId]);
  res.json(success(null, '日志已删除'));
}

/**
 * AI 优化日志内容（支持千问/DeepSeek，可使用用户自定义提示词）
 * POST /api/logs/optimize
 */
export async function optimizeLog(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { content, provider, promptId } = req.body || {};
  if (!content?.trim()) {
    res.status(400).json(fail('日志内容不能为空'));
    return;
  }
  const aiProvider: AiProvider = provider === 'deepseek' ? 'deepseek' : 'qwen';

  // 提示词优先级：指定 promptId > 用户默认 > 系统默认
  const systemPrompt = await getEffectivePrompt(userId, 'log_optimize', promptId);
  if (!systemPrompt) {
    res.status(500).json(fail('系统提示词未配置，请联系管理员初始化系统默认提示词'));
    return;
  }

  // Key 优先级：用户自己的 > 系统配置 > .env
  const userAiConfig = await getUserAiConfig(userId);
  const result = await chat(
    aiProvider,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    { override: aiProvider === 'qwen' ? userAiConfig.qwen : userAiConfig.deepseek }
  );
  res.json(success({ optimizedContent: result, provider: aiProvider }, '优化完成'));
}

/**
 * 日志统计（工作台/报表用）
 * GET /api/logs/stats?projectId=&startDate=&endDate=
 */
export async function logStats(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const scope = await getDataScope(currentUserId);
  const conditions: string[] = [];
  const params: any[] = [];

  if (scope.type !== 'all') {
    params.push(scope.userIds);
    conditions.push(`wl.user_id = ANY($${params.length}::int[])`);
  }
  const { projectId, startDate, endDate } = req.query;
  if (projectId) {
    params.push(parseInt(projectId as string, 10));
    conditions.push(`wl.project_id = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    conditions.push(`wl.log_date >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`wl.log_date <= $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM work_logs wl ${whereClause}`,
    params
  );
  const today = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM work_logs wl ${whereClause ? whereClause + ' AND' : 'WHERE'} wl.log_date = CURRENT_DATE`,
    params
  );
  const byProject = await queryMany(
    `SELECT p.id, p.name, COUNT(wl.id)::int AS cnt
     FROM projects p
     JOIN work_logs wl ON wl.project_id = p.id
     ${whereClause ? 'AND ' + conditions.join(' AND ') : ''}
     GROUP BY p.id, p.name ORDER BY cnt DESC`,
    params
  );
  const activeUsers = await queryOne<{ cnt: number }>(
    `SELECT COUNT(DISTINCT wl.user_id)::int AS cnt FROM work_logs wl ${whereClause}`,
    params
  );

  res.json(
    success({
      total: total?.cnt || 0,
      today: today?.cnt || 0,
      activeUsers: activeUsers?.cnt || 0,
      byProject,
    })
  );
}
