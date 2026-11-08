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
import { chat, chatStream, AiProvider, ChatMessage } from '../services/ai.service';
import { getUserAiConfig } from '../services/config.service';
import { getEffectivePrompt } from '../services/prompt.service';

/** 日志的小组标记项（groupId + 该组投入工时） */
interface LogGroupInput {
  groupId: number;
  hours?: number | null;
}

/**
 * 校验日志的小组标记：
 * - 必须关联项目；所有用户均可标记（能选到该项目即可见该项目）
 * - 所标记的小组必须属于该项目
 */
async function validateLogGroups(
  userId: number,
  projectId: number | null,
  groups: LogGroupInput[]
): Promise<string | null> {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  if (!projectId) return '日志未关联项目，不能标记小组';
  const ids = groups.map((g) => g.groupId);
  if (ids.some((i) => typeof i !== 'number')) return '小组参数无效';
  const valid = await queryMany<{ id: number }>(
    'SELECT id FROM project_groups WHERE id = ANY($1::int[]) AND project_id = $2',
    [ids, projectId]
  );
  if (valid.length !== new Set(ids).size) return '存在无效的小组（必须属于日志所选项目）';
  return null;
}

/**
 * 同步日志的小组标记（重建 work_log_groups 记录）
 * 每组未填工时时按总工时均摊
 */
async function syncLogGroups(
  logId: number,
  groups: LogGroupInput[],
  totalHours: number | null
): Promise<void> {
  await queryOne('DELETE FROM work_log_groups WHERE log_id = $1', [logId]);
  if (!Array.isArray(groups) || groups.length === 0) return;
  const n = groups.length;
  for (const g of groups) {
    const gh =
      g.hours != null
        ? g.hours
        : totalHours != null
          ? Math.round((totalHours / n) * 10) / 10
          : null;
    await queryOne('INSERT INTO work_log_groups (log_id, group_id, hours) VALUES ($1, $2, $3)', [
      logId,
      g.groupId,
      gh,
    ]);
  }
}

/** 日志列表/详情通用的小组标记聚合子查询 */
const GROUP_MARKS_SUBSQL = `COALESCE((
    SELECT json_agg(json_build_object('groupId', wlg.group_id, 'groupName', pg.name, 'hours', wlg.hours) ORDER BY wlg.group_id)
    FROM work_log_groups wlg
    JOIN project_groups pg ON pg.id = wlg.group_id
    WHERE wlg.log_id = wl.id
  ), '[]'::json) AS group_marks`;

/**
 * 查询日志列表（按数据权限过滤）
 * GET /api/logs?projectId=&userId=&startDate=&endDate=&keyword=&page=&pageSize=
 */
export async function listLogs(req: Request, res: Response) {
  const currentUserId = req.authUser!.id;
  const scope = await getDataScope(currentUserId);

  const conditions: string[] = [];
  const params: any[] = [];

  // 数据权限过滤：权限内用户的日志 + 标记了我所辖小组的日志（跨组协作可见）
  if (scope.type !== 'all') {
    if (scope.ledGroupIds && scope.ledGroupIds.length > 0) {
      params.push(scope.userIds);
      const userParamIdx = params.length;
      params.push(scope.ledGroupIds);
      conditions.push(
        `(wl.user_id = ANY($${userParamIdx}::int[]) OR wl.id IN (SELECT log_id FROM work_log_groups WHERE group_id = ANY($${params.length}::int[])))`
      );
    } else {
      params.push(scope.userIds);
      conditions.push(`wl.user_id = ANY($${params.length}::int[])`);
    }
  }

  const { projectId, userId, startDate, endDate, keyword, page, pageSize, source } = req.query;
  if (source) {
    params.push(String(source));
    conditions.push(`wl.source = $${params.length}`);
  }
  if (projectId) {
    params.push(parseInt(projectId as string, 10));
    conditions.push(`wl.project_id = $${params.length}`);
  }
  if (userId) {
    // 查看指定用户日志前先校验权限（含跨组标记：对方有日志标记了我所辖小组即可按人筛选）
    const targetUserId = parseInt(userId as string, 10);
    if (targetUserId !== currentUserId && !(scope.userIds?.includes(targetUserId) || scope.type === 'all')) {
      let crossGroupVisible = false;
      if (scope.ledGroupIds && scope.ledGroupIds.length > 0) {
        const marked = await queryOne(
          `SELECT 1 FROM work_log_groups wlg
           JOIN work_logs wl ON wl.id = wlg.log_id
           WHERE wl.user_id = $1 AND wlg.group_id = ANY($2::int[])
           LIMIT 1`,
          [targetUserId, scope.ledGroupIds]
        );
        crossGroupVisible = !!marked;
      }
      if (!crossGroupVisible) {
        res.status(403).json(fail('无权限查看该用户的日志', 403));
        return;
      }
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
    `SELECT wl.*, u.display_name AS user_name, u.username, p.name AS project_name,
       ${GROUP_MARKS_SUBSQL},
       COALESCE((
         SELECT a.status FROM edit_approvals a
         WHERE a.user_id = wl.user_id AND a.target_type = 'log' AND a.target_id = wl.id
           AND a.status IN ('pending', 'approved')
         ORDER BY CASE a.status WHEN 'approved' THEN 0 ELSE 1 END, a.id DESC
         LIMIT 1
       ), 'none') AS edit_approval_status
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
    `SELECT wl.*, u.display_name AS user_name, p.name AS project_name,
       ${GROUP_MARKS_SUBSQL}
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
    // 非权限内用户写的日志：若标记了我所辖的小组，仍可见（跨组协作）
    let markedMine = false;
    if (scope.ledGroupIds && scope.ledGroupIds.length > 0) {
      const marked = await queryOne(
        'SELECT 1 FROM work_log_groups WHERE log_id = $1 AND group_id = ANY($2::int[]) LIMIT 1',
        [logId, scope.ledGroupIds]
      );
      markedMine = !!marked;
    }
    if (!markedMine) {
      res.status(403).json(fail('无权限查看该日志', 403));
      return;
    }
  }
  res.json(success(log));
}

/**
 * 创建/更新日志（仅限本人，一天一篇，重复提交则更新）
 * 编辑规则：日志日期在本周内可自由修改；跨周修改需已获上级审批通过的申请
 * POST /api/logs
 */
export async function saveLog(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { logDate, projectId, content, optimizedContent, aiProvider, hours, groups, source, aiScore } =
    req.body || {};
  if (!logDate || !content?.trim()) {
    res.status(400).json(fail('日志日期和内容为必填项'));
    return;
  }
  // 所属项目：旧版填报必填；新版（source=v2）一天一条日志，项目信息在日志内容中，允许为空
  const isV2 = source === 'v2';
  const scoreValue = typeof aiScore === 'number' && aiScore >= 0 && aiScore <= 100 ? Math.round(aiScore) : null;
  if (!isV2 && !projectId) {
    res.status(400).json(fail('所属项目为必填项'));
    return;
  }
  // 小组标记校验（未传 groups 时不改动既有标记）
  const groupsProvided = groups !== undefined;
  if (groupsProvided) {
    const groupErr = await validateLogGroups(userId, projectId || null, groups);
    if (groupErr) {
      res.status(400).json(fail(groupErr));
      return;
    }
    // 各小组工时之和不能大于当天总工时（未填写的组按总工时均摊估算，与保存逻辑一致）
    const n = (groups as LogGroupInput[]).length;
    if (n > 0 && typeof hours === 'number') {
      const even = Math.round((hours / n) * 10) / 10;
      const sum = (groups as LogGroupInput[]).reduce(
        (s, g) => s + (typeof g.hours === 'number' ? g.hours : even),
        0
      );
      if (Math.round(sum * 10) / 10 > hours) {
        res.status(400).json(fail(`各小组工时之和（${Math.round(sum * 10) / 10}h）不能大于当天总工时（${hours}h）`));
        return;
      }
    }
  }
  const existing = await queryOne(
    'SELECT id FROM work_logs WHERE user_id = $1 AND log_date = $2',
    [userId, logDate]
  );
  if (!existing) {
    // 新建日志：仅可填写本周内（周一至周日）的日期（跨周的历史修改需走审批流程）
    const weekCheck = await queryOne<{ ok: boolean }>(
      `SELECT ($1::date >= date_trunc('week', CURRENT_DATE)::date
               AND $1::date < (date_trunc('week', CURRENT_DATE) + INTERVAL '7 days')::date) AS ok`,
      [logDate]
    );
    if (!weekCheck?.ok) {
      res.status(400).json(fail('只能填写本周（周一至周日）内的日志，历史周需按审批流程处理'));
      return;
    }
  }
  if (existing) {
    // 跨周修改校验：非本周的日志需审批（项目总监除外）
    const editable = await queryOne<{ in_week: boolean }>(
      `SELECT (log_date >= date_trunc('week', CURRENT_DATE)::date) AS in_week
       FROM work_logs WHERE id = $1`,
      [existing.id]
    );
    if (!editable?.in_week) {
      const meRole = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
      if (meRole?.role !== 'director' && meRole?.role !== 'admin') {
        const approval = await queryOne<{ id: number }>(
          `SELECT id FROM edit_approvals
           WHERE user_id = $1 AND target_type = 'log' AND target_id = $2 AND status = 'approved'
           LIMIT 1`,
          [userId, existing.id]
        );
        if (!approval) {
          res.status(403).json(fail('该日志已超过本周，修改需先提交申请并经上级审批', 403));
          return;
        }
        // 审批通过后仅允许修改一次，用完即失效
        await queryOne(`UPDATE edit_approvals SET status = 'used' WHERE id = $1`, [approval.id]);
      }
    }
    const updated = await queryOne(
      `UPDATE work_logs SET content = $1, optimized_content = $2, ai_provider = $3,
         hours = $4, project_id = $5, source = $6, ai_score = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        content,
        optimizedContent || null,
        aiProvider || null,
        hours || null,
        projectId || null,
        isV2 ? 'v2' : 'v1',
        scoreValue,
        existing.id,
      ]
    );
    if (groupsProvided) {
      await syncLogGroups(existing.id, groups, hours ?? null);
    }
    res.json(success(updated, '日志已更新'));
    return;
  }
  const created = await queryOne(
    `INSERT INTO work_logs (user_id, project_id, log_date, content, optimized_content, ai_provider, hours, source, ai_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      userId,
      projectId || null,
      logDate,
      content,
      optimizedContent || null,
      aiProvider || null,
      hours || null,
      isV2 ? 'v2' : 'v1',
      scoreValue,
    ]
  );
  if (groupsProvided) {
    await syncLogGroups(created!.id, groups, hours ?? null);
  }
  res.json(success(created, '日志提交成功'));
}

/**
 * 删除日志（仅限本人）
 * DELETE /api/logs/:id
 */
export async function deleteLog(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const logId = parseInt(req.params.id, 10);
  const log = await queryOne<{ user_id: number; in_week: boolean }>(
    `SELECT user_id, (log_date >= date_trunc('week', CURRENT_DATE)::date) AS in_week
     FROM work_logs WHERE id = $1`,
    [logId]
  );
  if (!log) {
    res.status(404).json(fail('日志不存在'));
    return;
  }
  if (log.user_id !== userId) {
    res.status(403).json(fail('只能删除自己的日志'));
    return;
  }
  // 本周以前的日志永远不能删除（任何角色，含项目总监/系统管理员）
  if (!log.in_week) {
    res.status(400).json(fail('本周以前填写的日志不能删除'));
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
 * 新版填报：对话式生成 + 质量检查 + 优化（多轮澄清）
 * POST /api/logs/assist
 * body: { date, projectId, todos, draft, history, provider }
 * 返回: { action: 'ask' | 'done', questions, result }
 */
export async function assistLog(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { date, todos, draft, history, provider } = req.body || {};
  const aiProvider: AiProvider = provider === 'deepseek' ? 'deepseek' : 'qwen';

  const me = await queryOne<{ display_name: string }>(
    'SELECT display_name FROM users WHERE id = $1',
    [userId]
  );
  const displayName = me?.display_name || '我';

  // 用户参与的全部项目及各项目小组（供 AI 核对名称，保证与项目管理数据一致）
  const myProjects = await queryMany<{ name: string; groups: string | null }>(
    `SELECT p.name,
       (SELECT string_agg(pg.name, '、' ORDER BY pg.id) FROM project_groups pg WHERE pg.project_id = p.id) AS groups
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
     ORDER BY p.id`,
    [userId]
  );
  const projectText = myProjects.length
    ? myProjects.map((p) => `- ${p.name}${p.groups ? `（小组：${p.groups}）` : '（未分组）'}`).join('\n')
    : '（未参与任何项目）';

  // 近 7 天历史日志（优化稿优先），供 AI 参考措辞与延续性
  const recentLogs = await queryMany<{
    log_date: string;
    optimized_content: string | null;
    content: string;
  }>(
    `SELECT log_date, optimized_content, content FROM work_logs
     WHERE user_id = $1 ORDER BY log_date DESC LIMIT 7`,
    [userId]
  );
  const recentText = recentLogs.length
    ? recentLogs
        .map((l) => `- ${l.log_date}：${(l.optimized_content || l.content || '').slice(0, 500)}`)
        .join('\n')
    : '（暂无历史日志）';

  const todoText =
    (Array.isArray(todos) ? todos : [])
      .map(
        (t: any, i: number) =>
          `${i + 1}. ${t?.status === 'done' ? '[已完成]' : '[未完成]'} ${String(t?.content || '').trim()}`
      )
      .join('\n') || '（无待办，请根据用户补充生成）';

  const context = [
    `【用户信息】姓名：${displayName}；日志日期：${date || '今天'}`,
    `【参与的项目与小组】（日志中出现的项目名、小组名必须与此清单完全一致，不得使用别名、简写或自行创造）\n${projectText}`,
    `【今日待办】\n${todoText}`,
    draft ? `【用户补充】${draft}` : '',
    `【历史日志参考】\n${recentText}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemPrompt = await getEffectivePrompt(userId, 'log_review');
  if (!systemPrompt) {
    res.status(500).json(fail('系统提示词未配置，请联系管理员初始化'));
    return;
  }

  const historyMsgs = (Array.isArray(history) ? history : [])
    .filter((h: any) => h && (h.content || h.role === 'assistant'))
    .map(
      (h: any) =>
        ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.content || ''),
        }) as ChatMessage
    );

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: context },
    ...historyMsgs,
  ];

  const userAiConfig = await getUserAiConfig(userId);

  // SSE 流式输出：先实时推送思考过程（think），AI 完整返回后解析并推送结构化结果
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const SEP = '===JSON===';

  let full = '';
  let sentThink = 0; // 已推送的思考文本长度
  try {
    for await (const chunk of chatStream(aiProvider, messages, {
      temperature: 0.3,
      override: aiProvider === 'qwen' ? userAiConfig.qwen : userAiConfig.deepseek,
    })) {
      full += chunk;
      const sepIdx = full.indexOf(SEP);
      const thinkEnd = sepIdx >= 0 ? sepIdx : full.length;
      if (thinkEnd > sentThink) {
        send({ type: 'think', text: full.slice(sentThink, thinkEnd) });
        sentThink = thinkEnd;
      }
    }
    const sepIdx = full.indexOf(SEP);
    const jsonText = sepIdx >= 0 ? full.slice(sepIdx + SEP.length) : full;
    send({ type: 'final', data: parseAssistResult(jsonText) });
  } catch (e: any) {
    send({ type: 'error', message: e?.message || 'AI 调用失败' });
  }
  send({ type: 'end' });
  res.end();
}

/**
 * 新版填报：保存前二次质检（只打分 + 给修改建议，不改写日志）
 * POST /api/logs/assist/review
 * body: { date, content, provider }
 * 返回: { score, summary, suggestions }
 */
export async function reviewLog(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { date, content, provider } = req.body || {};
  if (!content || !String(content).trim()) {
    res.status(400).json(fail('日志内容为空，无法质检'));
    return;
  }

  const systemPrompt = await getEffectivePrompt(userId, 'log_review');
  if (!systemPrompt) {
    res.status(500).json(fail('系统提示词未配置，请联系管理员初始化'));
    return;
  }

  const me = await queryOne<{ display_name: string }>(
    'SELECT display_name FROM users WHERE id = $1',
    [userId]
  );
  const displayName = me?.display_name || '我';
  const userAiConfig = await getUserAiConfig(userId);

  // 未显式指定模型时，自动选择已配置 Key 的模型（默认千问，未配置则回退 DeepSeek）
  let aiProvider: AiProvider = provider === 'deepseek' ? 'deepseek' : 'qwen';
  if (provider !== 'deepseek' && provider !== 'qwen') {
    aiProvider = userAiConfig.qwen.apiKey ? 'qwen' : 'deepseek';
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        '【任务模式：保存前二次质检】这次不要生成、也不要改写日志，只对下面这篇已确认的日志终稿做一次质量复检。',
        '按系统提示词中的《好日志规范》与评分标准打分：先在思考中逐项计算（结构层级 X/10、投入时长 X/10、明日计划 X/10、问题风险 X/10、事项质量 X/60），score 为各项之和。',
        '重要：同一篇日志只要内容相同，无论评多少次都必须得到相同分数——检查与打分尺度与生成日志时的质检完全一致，不要因为"复检"而额外从严。',
        '然后给出具体、可执行的修改建议（完全达标则给出通过结论）。',
        '思考过程后，用一行 ===JSON=== 分隔，输出 JSON：',
        '{"score":分数,"summary":"一句话总评","suggestions":["建议1","建议2"]}',
        '要求：score 为 0~100 整数；suggestions 每条具体到条目与改法（引用原文说明改哪里、怎么改），最多 5 条，完全达标可为空数组；不要输出日志改写稿。',
        '',
        `【作者】${displayName}；【日志日期】${date || '今天'}`,
        '【日志终稿】',
        String(content),
      ].join('\n'),
    },
  ];

  try {
    const full = await chat(aiProvider, messages, {
      temperature: 0, // 复检要求确定性：同一篇日志多次评分应得到相同分数
      override: aiProvider === 'qwen' ? userAiConfig.qwen : userAiConfig.deepseek,
    });
    const SEP = '===JSON===';
    const sepIdx = full.indexOf(SEP);
    const jsonText = sepIdx >= 0 ? full.slice(sepIdx + SEP.length) : full;
    let text = jsonText.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    let score: number | null = null;
    let summary = '';
    let suggestions: string[] = [];
    try {
      const obj = JSON.parse(text);
      score = typeof obj.score === 'number' ? Math.min(100, Math.max(0, Math.round(obj.score))) : null;
      summary = String(obj.summary || '');
      suggestions = Array.isArray(obj.suggestions)
        ? obj.suggestions.map((s: unknown) => String(s)).filter(Boolean).slice(0, 5)
        : [];
    } catch {
      // 解析失败：把思考过程截取为总评，避免整次质检作废
      summary = (sepIdx >= 0 ? full.slice(0, sepIdx) : full).trim().slice(0, 300) || 'AI 返回格式异常，请参考对话区检查结果判断';
    }
    res.json(success({ score, summary, suggestions }));
  } catch (e: any) {
    res.status(500).json(fail(e?.message || 'AI 调用失败'));
  }
}

/** 解析 AI 返回的 JSON（容错：剥离围栏 / 多余文字） */
function parseAssistResult(raw: string): {
  action: 'continue' | 'done';
  score: number | null;
  summary: string;
  questions: { field: string; question: string; options: string[] }[];
  result: { project?: string; content: string; hours: number | null; groups: { name: string; hours: number | null }[] } | null;
} {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(text);
    const questions = Array.isArray(obj.questions) ? obj.questions : [];
    const result = obj.action === 'done' && obj.result ? obj.result : null;
    return {
      action: obj.action === 'done' ? 'done' : 'continue',
      score: typeof obj.score === 'number' ? Math.round(obj.score) : null,
      summary: String(obj.summary || ''),
      questions,
      result: result
        ? {
            project: typeof result.project === 'string' ? result.project : '',
            content: String(result.content || ''),
            hours: typeof result.hours === 'number' ? result.hours : null,
            groups: Array.isArray(result.groups) ? result.groups : [],
          }
        : null,
    };
  } catch {
    // 解析失败：降级为最终结果，把原文当日志内容
    return {
      action: 'done',
      score: null,
      summary: 'AI 结果解析失败，已将原文作为日志内容',
      questions: [],
      result: { project: '', content: raw, hours: null, groups: [] },
    };
  }
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
    if (scope.ledGroupIds && scope.ledGroupIds.length > 0) {
      params.push(scope.userIds);
      const userParamIdx = params.length;
      params.push(scope.ledGroupIds);
      conditions.push(
        `(wl.user_id = ANY($${userParamIdx}::int[]) OR wl.id IN (SELECT log_id FROM work_log_groups WHERE group_id = ANY($${params.length}::int[])))`
      );
    } else {
      params.push(scope.userIds);
      conditions.push(`wl.user_id = ANY($${params.length}::int[])`);
    }
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
