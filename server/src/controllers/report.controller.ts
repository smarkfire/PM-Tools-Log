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

/** 转义正则特殊字符，用于按项目名/小组名精确匹配内容标题 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  // v2 日志小组信息在内容三级标题中（"### 小组名称：xxx"，兼容旧格式"### xxx"），名称→id 映射
  const groupIdByName = new Map(groups.map((g) => [g.name, g.id]));

  for (const l of logRows) {
    // v2（对话式）日志：按内容小组标题归组，工时按涉及组数均摊；标题不匹配任何小组时归入未分组
    if (l.source === 'v2') {
      const text = l.optimized_content || l.content;
      const names = [...text.matchAll(/^###\s*(?:小组名称[:：]\s*)?(.+)$/gm)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      const gids = [...new Set(names.map((n) => groupIdByName.get(n)).filter((v): v is number => v != null))];
      if (gids.length === 0) {
        ungroupedLines.push(logLine(l, l.hours == null ? null : num(l.hours), '工时'));
        ungroupedHours += num(l.hours);
        continue;
      }
      const per = l.hours != null ? Math.round((num(l.hours) / gids.length) * 10) / 10 : null;
      for (const gid of gids) {
        const b = buckets.get(gid);
        if (!b) continue;
        b.lines.push(logLine(l, per));
        if (per != null) b.hours += per;
      }
      continue;
    }
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
 * 按小组过滤项目日志（为单个小组生成报告）
 * 归属规则：
 * - v1 日志有显式小组标记（work_log_groups）→ 只看标记，标记为其他小组则排除
 * - 日志内容含"### 小组名称：xxx"（或旧格式"### xxx"）标题 → 按标题（v2 日志主通道）
 * - v1 未标记日志 → 回退到作者是否为该小组成员
 */
async function filterLogsByGroup(group: { id: number; name: string }, logRows: any[]): Promise<any[]> {
  const logIds = logRows.map((l) => l.id);
  const marks = logIds.length
    ? await queryMany<{ log_id: number; group_id: number }>(
        'SELECT log_id, group_id FROM work_log_groups WHERE log_id = ANY($1::int[])',
        [logIds]
      )
    : [];
  const markedLogIds = new Set(marks.map((m) => m.log_id));
  const groupMarkIds = new Set(marks.filter((m) => m.group_id === group.id).map((m) => m.log_id));
  const authorIds = [...new Set(logRows.map((l) => l.user_id))];
  const memberRows = authorIds.length
    ? await queryMany<{ user_id: number }>(
        'SELECT user_id FROM project_group_members WHERE group_id = $1 AND user_id = ANY($2::int[])',
        [group.id, authorIds]
      )
    : [];
  const memberSet = new Set(memberRows.map((m) => m.user_id));
  const groupRe = new RegExp(`^###\\s*(?:小组名称[:：]\\s*)?${escapeRegExp(group.name)}\\s*$`, 'm');
  return logRows.filter((l) => {
    if (markedLogIds.has(l.id)) return groupMarkIds.has(l.id);
    if (groupRe.test(l.optimized_content || l.content)) return true;
    return l.source !== 'v2' && memberSet.has(l.user_id);
  });
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
  const { type, scope, targetUserId, projectId, groupId, date, startDate, endDate, provider, promptId, groupBy } =
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
  /** 项目报告可指定小组（group 报告）：只为该小组生成 */
  let group: { id: number; name: string } | null = null;

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
    const pid = parseInt(projectId, 10);
    if (!(await canManageProject(currentUserId, pid))) {
      res.status(403).json(fail('无权限：仅项目总监或该项目经理可生成项目报告', 403));
      return;
    }
    const project = await queryOne<{ name: string }>('SELECT name FROM projects WHERE id = $1', [pid]);
    if (!project) {
      res.status(400).json(fail('项目不存在'));
      return;
    }

    // 可选：为指定小组单独生成报告
    if (groupId) {
      group = await queryOne<{ id: number; name: string }>(
        'SELECT id, name FROM project_groups WHERE id = $1 AND project_id = $2',
        [parseInt(groupId, 10), pid]
      );
      if (!group) {
        res.status(400).json(fail('小组不存在或不属于该项目'));
        return;
      }
    }

    // 项目成员（圈定 v2 日志候选范围：v2 日志项目信息在内容中，无 project_id）
    const memberRows = await queryMany<{ user_id: number }>(
      'SELECT user_id FROM project_members WHERE project_id = $1',
      [pid]
    );
    // v1 日志按 project_id 归属；v2 日志按"成员 + 内容含『## 项目名称：xxx』标题"归属（兼容旧格式）
    logRows = await queryMany(
      `SELECT wl.id, wl.user_id, wl.source, wl.log_date, wl.content, wl.optimized_content, wl.hours,
              p.name AS project_name, u.display_name
       FROM work_logs wl
       JOIN users u ON u.id = wl.user_id
       LEFT JOIN projects p ON p.id = wl.project_id
       WHERE wl.log_date BETWEEN $1 AND $2
         AND (wl.project_id = $3 OR (wl.source = 'v2' AND wl.user_id = ANY($4::int[])))
       ORDER BY wl.log_date`,
      [start, end, pid, memberRows.map((m) => m.user_id)]
    );
    const projRe = project.name
      ? new RegExp(`^##\\s*(?:项目名称[:：]\\s*)?${escapeRegExp(project.name)}\\s*$`, 'm')
      : null;
    logRows = logRows.filter(
      (l) => l.project_id === pid || (projRe != null && projRe.test(l.optimized_content || l.content))
    );

    // 小组报告：只保留涉及该小组的日志
    if (group) {
      logRows = await filterLogsByGroup(group, logRows);
    }

    titlePrefix = `${project.name} 项目${group ? ` · ${group.name} 小组` : ''} `;
  }

  if (logRows.length === 0) {
    res.status(400).json(fail('所选周期内没有工作日志，无法生成报告'));
    return;
  }

  // 组装日志上下文（优先使用优化后内容）
  // 项目报告支持"按小组分组"模式：按小组分节组织，含各组工时与空组提醒（单小组报告不分组）
  const useGroupBy = scope === 'project' && groupBy === 'group' && !group;
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

  // 标准日志模板结构说明：v2 日志的项目/小组信息以内容标题为准，AI 按标题归集（不依赖日志表外键）
  const structureNote =
    '【日志数据结构说明】日志采用标准 Markdown 模板：一级标题"{日期} {姓名} 的日志"（日期在前、姓名在后）；二级标题"项目名称：xxx"（其下第一行为"投入时长：X小时"），另有"明日计划""问题与风险"两个固定章节；三级标题"小组名称：xxx"，组下逐条为具体工作事项。' +
    '归集项目、小组与工时时请严格以这些标题为准，项目名、小组名保持日志原文，不得改写、缩写或另起别名；"明日计划""问题与风险"章节的内容不要计入本期已完成工作。\n\n';

  const userMessage = useGroupBy
    ? `请生成 ${titlePrefix}${reportTypeName}（周期：${start} 至 ${end}）。\n\n` +
      `报告组织要求：请严格按下方的小组结构组织内容——先给出项目整体概述（总工时、整体进展与成果），` +
      `然后每个小组一节（本组本周工作、进展评估、风险与下周重点，注明各组投入工时），` +
      `最后单独列出"本期无日志的小组"（如有）。日志已按小组归类、工时已按组分配（跨组协作的日志会出现在多个组中）。\n\n` +
      `${structureNote}各小组工作日志如下：\n\n${logContext}`
    : group
      ? `请生成 ${titlePrefix}${reportTypeName}（周期：${start} 至 ${end}）。\n\n` +
        `本报告仅针对「${group.name}」小组：只统计该小组本期的工作（日志中以"### 小组名称：${group.name}"标注的事项即该组工作），` +
        `报告标题注明小组名称，聚焦该组的工作内容、投入工时、进展与风险，不要编写其他小组的内容。\n\n` +
        `${structureNote}该小组本期工作日志如下：\n\n${logContext}`
      : `请生成 ${titlePrefix}${reportTypeName}（周期：${start} 至 ${end}）。\n\n${structureNote}${logContext}`;

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

  // 保存报告（小组报告记录 group_id，便于列表区分与追溯）
  const report = await queryOne(
    `INSERT INTO reports (type, scope, user_id, target_user_id, project_id, group_id, period_start, period_end, content, ai_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      type,
      scope,
      currentUserId,
      scope === 'personal' ? targetUserId || currentUserId : null,
      scope === 'project' ? projectId : null,
      group ? group.id : null,
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
    `SELECT r.id, r.type, r.scope, r.user_id, r.target_user_id, r.project_id, r.group_id,
            r.period_start, r.period_end, r.ai_provider, r.created_at,
            g.display_name AS generator_name, t.display_name AS target_name, p.name AS project_name,
            gr.name AS group_name
     FROM reports r
     JOIN users g ON g.id = r.user_id
     LEFT JOIN users t ON t.id = r.target_user_id
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN project_groups gr ON gr.id = r.group_id
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
    `SELECT r.*, g.display_name AS generator_name, t.display_name AS target_name, p.name AS project_name,
            gr.name AS group_name
     FROM reports r
     JOIN users g ON g.id = r.user_id
     LEFT JOIN users t ON t.id = r.target_user_id
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN project_groups gr ON gr.id = r.group_id
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
    if (meRole?.role !== 'director' && meRole?.role !== 'admin') {
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
