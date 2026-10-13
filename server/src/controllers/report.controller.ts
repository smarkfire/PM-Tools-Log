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

/** pg 返回 DATE 为 Date 对象，统一格式化为 YYYY-MM-DD 字符串 */
function fmtDay(v: unknown): string {
  return v instanceof Date ? fmt(v) : String(v);
}

/**
 * 按小组组织项目日志上下文（项目报告"按小组分组"模式）
 * 归属规则：日志显式标记（work_log_groups）优先；未标记时回退到作者所属小组（均摊工时）
 * 各组工时：优先用标记时填写的分组工时；无标记回退时按所属组数均摊
 */
export async function buildGroupedLogContext(projectId: number, logRows: any[]): Promise<string> {
  const groups = await queryMany<{ id: number; name: string; leader_name: string | null }>(
    `SELECT pg.id, pg.name, u.display_name AS leader_name
     FROM project_groups pg LEFT JOIN users u ON u.id = pg.leader_id
     WHERE pg.project_id = $1 ORDER BY pg.id`,
    [projectId]
  );

  type Mark = { group_id: number; group_name: string; hours: number | null };
  const logIds = logRows.map((l) => l.id);
  const marksByLog = new Map<number, Mark[]>();
  if (logIds.length > 0) {
    const marks = await queryMany<Mark & { log_id: number }>(
      `SELECT wlg.log_id, wlg.group_id, wlg.hours, pg.name AS group_name
       FROM work_log_groups wlg JOIN project_groups pg ON pg.id = wlg.group_id
       WHERE wlg.log_id = ANY($1::int[])`,
      [logIds]
    );
    marks.forEach((m) => {
      if (!marksByLog.has(m.log_id)) marksByLog.set(m.log_id, []);
      marksByLog.get(m.log_id)!.push({ group_id: m.group_id, group_name: m.group_name, hours: m.hours });
    });
  }

  // 未标记日志的回退归属：作者在该项目所属的小组
  const authorIds = [...new Set(logRows.map((l) => l.user_id))];
  const authorGroups = authorIds.length
    ? await queryMany<{ user_id: number; group_id: number; group_name: string }>(
        `SELECT pgm.user_id, pgm.group_id, pg.name AS group_name
         FROM project_group_members pgm JOIN project_groups pg ON pg.id = pgm.group_id
         WHERE pgm.project_id = $1 AND pgm.user_id = ANY($2::int[])`,
        [projectId, authorIds]
      )
    : [];
  const authorGroupsByUser = new Map<number, { group_id: number; group_name: string }[]>();
  authorGroups.forEach((ag) => {
    if (!authorGroupsByUser.has(ag.user_id)) authorGroupsByUser.set(ag.user_id, []);
    authorGroupsByUser.get(ag.user_id)!.push({ group_id: ag.group_id, group_name: ag.group_name });
  });

  // 初始化各小组的内容桶
  const buckets = new Map<number, { name: string; leader: string | null; lines: string[]; hours: number }>();
  groups.forEach((g) => buckets.set(g.id, { name: g.name, leader: g.leader_name, lines: [], hours: 0 }));
  const ungroupedLines: string[] = [];
  let ungroupedHours = 0;

  // pg 返回 NUMERIC 为字符串，统一转为 number 再累加
  const num = (v: unknown): number => (v == null ? 0 : Number(v));

  const logLine = (l: any, h: number | null, hourLabel = '本组工时') =>
    `- [${fmtDay(l.log_date)}] ${l.display_name}${h != null ? `（${hourLabel} ${h}h）` : ''}：\n  ${(
      l.optimized_content || l.content
    ).replace(/\n/g, '\n  ')}`;

  for (const l of logRows) {
    const marks = marksByLog.get(l.id) || [];
    let eff: { group_id: number; hours: number | null }[];
    if (marks.length > 0) {
      eff = marks.map((m) => ({ group_id: m.group_id, hours: m.hours == null ? null : num(m.hours) }));
    } else {
      const ag = authorGroupsByUser.get(l.user_id) || [];
      eff = ag.map((g) => ({
        group_id: g.group_id,
        hours: ag.length > 0 && l.hours != null ? Math.round((num(l.hours) / ag.length) * 10) / 10 : null,
      }));
    }
    if (eff.length === 0) {
      ungroupedLines.push(logLine(l, l.hours == null ? null : num(l.hours), '工时'));
      ungroupedHours += num(l.hours);
      continue;
    }
    for (const e of eff) {
      const b = buckets.get(e.group_id);
      if (!b) continue; // 小组可能已被删除，忽略残留标记
      b.lines.push(logLine(l, e.hours));
      b.hours += num(e.hours);
    }
  }

  const parts: string[] = [];
  for (const g of groups) {
    const b = buckets.get(g.id)!;
    const header = `### ${g.name}（组长：${g.leader_name || '未指定'}｜本期投入 ${b.hours.toFixed(1)}h）`;
    parts.push(b.lines.length ? `${header}\n${b.lines.join('\n')}` : `${header}\n（本期无日志）`);
  }
  if (ungroupedLines.length > 0) {
    parts.push(`### 未分组（项目整体/无小组归属，本期投入 ${ungroupedHours.toFixed(1)}h）\n${ungroupedLines.join('\n')}`);
  }

  const emptyGroups = groups.filter((g) => buckets.get(g.id)!.lines.length === 0).map((g) => g.name);
  if (emptyGroups.length > 0) {
    parts.push(`【提醒】以下小组本期没有任何工作日志：${emptyGroups.join('、')}`);
  }
  return parts.join('\n\n');
}

/**
 * 生成报告
 * POST /api/reports/generate
 * body: { type: 'weekly'|'monthly', scope: 'personal'|'project', targetUserId?, projectId?,
 *         date?（基准日期，自动推算周期）, startDate?/endDate?（自定义范围，优先于 date）,
 *         provider?, promptId? }
 */
export async function generateReport(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const { type, scope, targetUserId, projectId, date, startDate, endDate, provider, promptId, groupBy } =
    req.body || {};
  if (!['weekly', 'monthly'].includes(type) || !['personal', 'project'].includes(scope)) {
    res.status(400).json(fail('无效的报告类型或范围'));
    return;
  }
  const aiProvider: AiProvider = provider === 'deepseek' ? 'deepseek' : 'qwen';

  // 周期计算：自定义日期范围优先，其次按基准日期自动推算
  let start: string;
  let end: string;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && endDate) {
    if (!dateRe.test(String(startDate)) || !dateRe.test(String(endDate))) {
      res.status(400).json(fail('日期格式无效，应为 YYYY-MM-DD'));
      return;
    }
    if (String(startDate) > String(endDate)) {
      res.status(400).json(fail('开始日期不能晚于结束日期'));
      return;
    }
    start = String(startDate);
    end = String(endDate);
  } else {
    ({ start, end } = getPeriod(type, date));
  }
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
      `SELECT wl.id, wl.user_id, wl.log_date, wl.content, wl.optimized_content, wl.hours, p.name AS project_name, u.display_name
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
  // 项目报告支持"按小组分组"模式：按小组分节组织，含各组工时与空组提醒
  const useGroupBy = scope === 'project' && groupBy === 'group';
  let logContext: string;
  if (useGroupBy) {
    logContext = await buildGroupedLogContext(parseInt(projectId, 10), logRows);
  } else {
    logContext = logRows
      .map(
        (l) =>
          `- [${fmtDay(l.log_date)}] ${l.display_name || ''} ${l.project_name ? `(${l.project_name})` : ''} 工时:${l.hours || '-'}h\n  ${(l.optimized_content || l.content).replace(/\n/g, '\n  ')}`
      )
      .join('\n');
  }

  // 提示词优先级：指定 promptId > 用户默认 > 系统默认
  const basePrompt = await getEffectivePrompt(currentUserId, 'report', promptId);
  if (!basePrompt) {
    res.status(500).json(fail('系统提示词未配置，请联系管理员初始化系统默认提示词'));
    return;
  }
  const systemPrompt = basePrompt.includes('{REPORT_TYPE}')
    ? basePrompt.replace('{REPORT_TYPE}', reportTypeName)
    : basePrompt;

  const userMessage = useGroupBy
    ? `请生成 ${titlePrefix}${reportTypeName}（周期：${start} 至 ${end}）。\n\n` +
      `报告组织要求：请严格按下方的小组结构组织内容——先给出项目整体概述（总工时、整体进展与成果），` +
      `然后每个小组一节（本组本周工作、进展评估、风险与下周重点，注明各组投入工时），` +
      `最后单独列出"本期无日志的小组"（如有）。日志已按小组归类、工时已按组分配（跨组协作的日志会出现在多个组中）。\n\n` +
      `各小组工作日志如下：\n\n${logContext}`
    : `请生成 ${titlePrefix}${reportTypeName}（周期：${start} 至 ${end}）。\n\n${logContext}`;

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
    conditions.push(`(r.target_user_id = ANY($${params.length}::int[]) OR r.user_id = ANY($${params.length}::int[]))`);
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
 * 编辑报告内容（生成者本人）
 * 编辑规则：生成时间在本周内可自由修改；跨周修改需已获上级审批通过的申请
 * PUT /api/reports/:id
 */
export async function updateReport(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const reportId = parseInt(req.params.id, 10);
  const { content } = req.body || {};
  if (!content?.trim()) {
    res.status(400).json(fail('报告内容不能为空'));
    return;
  }
  const report = await queryOne('SELECT id, user_id FROM reports WHERE id = $1', [reportId]);
  if (!report) {
    res.status(404).json(fail('报告不存在'));
    return;
  }
  if (report.user_id !== currentUserId) {
    res.status(403).json(fail('只能编辑自己生成的报告', 403));
    return;
  }
  // 跨周修改校验：生成时间非本周需审批（项目总监除外）
  const editable = await queryOne<{ in_week: boolean }>(
    `SELECT (created_at >= date_trunc('week', CURRENT_DATE)) AS in_week
     FROM reports WHERE id = $1`,
    [reportId]
  );
  if (!editable?.in_week) {
    const meRole = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [currentUserId]);
    if (meRole?.role !== 'director') {
      const approval = await queryOne<{ id: number }>(
        `SELECT id FROM edit_approvals
         WHERE user_id = $1 AND target_type = 'report' AND target_id = $2 AND status = 'approved'
         LIMIT 1`,
        [currentUserId, reportId]
      );
      if (!approval) {
        res.status(403).json(fail('该报告已超过本周，修改需先提交申请并经上级审批', 403));
        return;
      }
      // 审批通过后仅允许修改一次，用完即失效
      await queryOne(`UPDATE edit_approvals SET status = 'used' WHERE id = $1`, [approval.id]);
    }
  }
  const updated = await queryOne(
    'UPDATE reports SET content = $1 WHERE id = $2 RETURNING *',
    [content, reportId]
  );
  res.json(success(updated, '报告已更新'));
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
