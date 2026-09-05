/**
 * 报告控制器：个人周报/月报、项目周报/月报
 *
 * 权限规则：
 * - 个人报告：任何用户可生成自己的；总监/有权者可生成权限范围内成员的
 * - 项目报告：仅项目总监或该项目经理可生成
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { getDataScope, canManageProject } from '../services/permission.service';
import { chat, AiProvider } from '../services/ai.service';
import { getUserAiConfig } from '../services/config.service';
import { getEffectivePrompt } from '../services/prompt.service';

/** 计算周期：周报以周一为起点，月报以自然月 */
function getPeriod(type: string, dateStr?: string): { start: string; end: string } {
  const base = dateStr ? new Date(dateStr) : new Date();
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  if (type === 'monthly') {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { start: fmt(start), end: fmt(end) };
  }
  // weekly: 找到本周周一
  const day = base.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(y, m, d + diff);
  const sunday = new Date(y, m, d + diff + 6);
  return { start: fmt(monday), end: fmt(sunday) };
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 生成报告
 * POST /api/reports/generate
 * body: { type: 'weekly'|'monthly', scope: 'personal'|'project', targetUserId?, projectId?, date?, provider?, promptId? }
 */
export async function generateReport(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const { type, scope, targetUserId, projectId, date, provider, promptId } = req.body || {};
  if (!['weekly', 'monthly'].includes(type) || !['personal', 'project'].includes(scope)) {
    res.status(400).json(fail('无效的报告类型或范围'));
    return;
  }
  const aiProvider: AiProvider = provider === 'deepseek' ? 'deepseek' : 'qwen';
  const { start, end } = getPeriod(type, date);
  const reportTypeName = type === 'weekly' ? '周报' : '月报';

  let logRows: any[];
  let titlePrefix = '';

  if (scope === 'personal') {
    // 个人报告：目标用户（默认自己）
    const target = targetUserId || currentUserId;
    if (target !== currentUserId) {
      const scopeData = await getDataScope(currentUserId);
      if (scopeData.type !== 'all' && !scopeData.userIds?.includes(target)) {
        res.status(403).json(fail('无权限为该用户生成报告', 403));
        return;
      }
    }
    logRows = await queryMany(
      `SELECT wl.log_date, wl.content, wl.optimized_content, wl.hours, p.name AS project_name, u.display_name
       FROM work_logs wl
       JOIN users u ON u.id = wl.user_id
       LEFT JOIN projects p ON p.id = wl.project_id
       WHERE wl.user_id = $1 AND wl.log_date BETWEEN $2 AND $3
       ORDER BY wl.log_date`,
      [target, start, end]
    );
    const targetUser = await queryOne<{ display_name: string }>(
      'SELECT display_name FROM users WHERE id = $1', [target]
    );
    titlePrefix = targetUser ? `${targetUser.display_name} 的` : '';
  } else {
    // 项目报告：需管理权限
    if (!projectId) {
      res.status(400).json(fail('项目报告必须指定项目'));
      return;
    }
    if (!(await canManageProject(currentUserId, parseInt(projectId, 10)))) {
      res.status(403).json(fail('无权限：仅项目总监或该项目经理可生成项目报告', 403));
      return;
    }
    logRows = await queryMany(
      `SELECT wl.log_date, wl.content, wl.optimized_content, wl.hours, p.name AS project_name, u.display_name
       FROM work_logs wl
       JOIN users u ON u.id = wl.user_id
       LEFT JOIN projects p ON p.id = wl.project_id
       WHERE wl.project_id = $1 AND wl.log_date BETWEEN $2 AND $3
       ORDER BY wl.log_date`,
      [projectId, start, end]
    );
    const project = await queryOne<{ name: string }>('SELECT name FROM projects WHERE id = $1', [projectId]);
    titlePrefix = project ? `${project.name} 项目 ` : '';
  }

  if (logRows.length === 0) {
    res.status(400).json(fail('所选周期内没有工作日志，无法生成报告'));
    return;
  }

  // 组装日志上下文（优先使用优化后内容）
  const logContext = logRows
    .map(
      (l) =>
        `- [${l.log_date}] ${l.display_name || ''} ${l.project_name ? `(${l.project_name})` : ''} 工时:${l.hours || '-'}h\n  ${(l.optimized_content || l.content).replace(/\n/g, '\n  ')}`
    )
    .join('\n');

  // 提示词优先级：指定 promptId > 用户默认 > 系统默认
  const basePrompt = await getEffectivePrompt(currentUserId, 'report', promptId);
  if (!basePrompt) {
    res.status(500).json(fail('系统提示词未配置，请联系管理员初始化系统默认提示词'));
    return;
  }
  const systemPrompt = basePrompt.includes('{REPORT_TYPE}')
    ? basePrompt.replace('{REPORT_TYPE}', reportTypeName)
    : basePrompt;

  const userMessage = `请生成 ${titlePrefix}${reportTypeName}（周期：${start} 至 ${end}）。\n\n${logContext}`;

  // Key 优先级：用户自己的 > 系统配置 > .env
  const userAiConfig = await getUserAiConfig(currentUserId);
  const content = await chat(
    aiProvider,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    { override: aiProvider === 'qwen' ? userAiConfig.qwen : userAiConfig.deepseek }
  );

  // 保存报告
  const report = await queryOne(
    `INSERT INTO reports (type, scope, user_id, target_user_id, project_id, period_start, period_end, content, ai_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      type,
      scope,
      currentUserId,
      scope === 'personal' ? targetUserId || currentUserId : null,
      scope === 'project' ? projectId : null,
      start,
      end,
      content,
      aiProvider,
    ]
  );

  res.json(success(report, '报告生成成功'));
}

/**
 * 查询报告列表（按权限过滤）
 * GET /api/reports?type=&scope=&projectId=&page=&pageSize=
 */
export async function listReports(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const scopeData = await getDataScope(currentUserId);

  const conditions: string[] = [];
  const params: any[] = [];

  // 权限过滤：总监看全部；经理/组长看权限范围内目标用户的报告；成员看自己生成或关于自己的
  if (scopeData.type !== 'all') {
    params.push([...(scopeData.userIds || []), currentUserId]);
    conditions.push(`(r.target_user_id = ANY($${params.length}::int[]) OR r.user_id = $${params.length}::int[] OR r.project_id IS NULL AND r.user_id = ANY($${params.length}::int[]))`);
  }

  const { type, scope, projectId, page, pageSize } = req.query;
  if (type) {
    params.push(type);
    conditions.push(`r.type = $${params.length}`);
  }
  if (scope) {
    params.push(scope);
    conditions.push(`r.scope = $${params.length}`);
  }
  if (projectId) {
    params.push(parseInt(projectId as string, 10));
    conditions.push(`r.project_id = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(1, parseInt((page as string) || '1', 10));
  const size = Math.min(50, Math.max(1, parseInt((pageSize as string) || '20', 10)));

  const totalRes = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM reports r ${whereClause}`,
    params
  );
  const reports = await queryMany(
    `SELECT r.id, r.type, r.scope, r.user_id, r.target_user_id, r.project_id,
            r.period_start, r.period_end, r.ai_provider, r.created_at,
            g.display_name AS generator_name, t.display_name AS target_name, p.name AS project_name
     FROM reports r
     JOIN users g ON g.id = r.user_id
     LEFT JOIN users t ON t.id = r.target_user_id
     LEFT JOIN projects p ON p.id = r.project_id
     ${whereClause}
     ORDER BY r.created_at DESC
     LIMIT ${size} OFFSET ${(pageNum - 1) * size}`,
    params
  );

  res.json(success({ list: reports, total: totalRes?.cnt || 0, page: pageNum, pageSize: size }));
}

/**
 * 获取报告详情
 * GET /api/reports/:id
 */
export async function getReport(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const reportId = parseInt(req.params.id, 10);
  const report = await queryOne(
    `SELECT r.*, g.display_name AS generator_name, t.display_name AS target_name, p.name AS project_name
     FROM reports r
     JOIN users g ON g.id = r.user_id
     LEFT JOIN users t ON t.id = r.target_user_id
     LEFT JOIN projects p ON p.id = r.project_id
     WHERE r.id = $1`,
    [reportId]
  );
  if (!report) {
    res.status(404).json(fail('报告不存在'));
    return;
  }
  // 权限校验：总监全部可见；项目报告需可见该项目；个人报告需为生成者/目标/权限内
  const scopeData = await getDataScope(currentUserId);
  const canView =
    report.user_id === currentUserId ||
    (report.target_user_id === currentUserId) ||
    scopeData.type === 'all' ||
    (report.target_user_id ? scopeData.userIds?.includes(report.target_user_id) : false) ||
    (report.project_id ? scopeData.projectIds?.includes(report.project_id) : false);
  if (!canView) {
    res.status(403).json(fail('无权限查看该报告', 403));
    return;
  }
  res.json(success(report));
}

/**
 * 删除报告（生成者本人或总监）
 * DELETE /api/reports/:id
 */
export async function deleteReport(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const reportId = parseInt(req.params.id, 10);
  const report = await queryOne('SELECT user_id FROM reports WHERE id = $1', [reportId]);
  if (!report) {
    res.status(404).json(fail('报告不存在'));
    return;
  }
  const scopeData = await getDataScope(currentUserId);
  if (report.user_id !== currentUserId && scopeData.type !== 'all') {
    res.status(403).json(fail('无权限删除该报告', 403));
    return;
  }
  await queryOne('DELETE FROM reports WHERE id = $1', [reportId]);
  res.json(success(null, '报告已删除'));
}
