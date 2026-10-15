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

  const { projectId, userId, startDate, endDate, keyword, page, pageSize } = req.query;
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
       ${GROUP_MARKS_SUBSQL}
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
  const { logDate, projectId, content, optimizedContent, aiProvider, hours, groups } =
    req.body || {};
  if (!logDate || !content?.trim()) {
    res.status(400).json(fail('日志日期和内容为必填项'));
    return;
  }
  // 所属项目必填
  if (!projectId) {
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
  }
  const existing = await queryOne(
    'SELECT id FROM work_logs WHERE user_id = $1 AND log_date = $2',
    [userId, logDate]
  );
  if (!existing) {
    // 新建日志：仅可填写本周内的日期（跨周的历史修改需走审批流程）
    const weekCheck = await queryOne<{ ok: boolean }>(
      `SELECT ($1::date >= date_trunc('week', CURRENT_DATE)::date) AS ok`,
      [logDate]
    );
    if (!weekCheck?.ok) {
      res.status(400).json(fail('只能填写本周内的日志，历史周需按审批流程处理'));
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
         hours = $4, project_id = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [content, optimizedContent || null, aiProvider || null, hours || null, projectId || null, existing.id]
    );
    if (groupsProvided) {
      await syncLogGroups(existing.id, groups, hours ?? null);
    }
    res.json(success(updated, '日志已更新'));
    return;
  }
  const created = await queryOne(
    `INSERT INTO work_logs (user_id, project_id, log_date, content, optimized_content, ai_provider, hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, projectId || null, logDate, content, optimizedContent || null, aiProvider || null, hours || null]
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
  // 本周以前的日志不可删除（项目总监/系统管理员除外，与跨周编辑规则一致）
  if (!log.in_week) {
    const meRole = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
    if (meRole?.role !== 'director' && meRole?.role !== 'admin') {
      res.status(400).json(fail('本周以前填写的日志不能删除'));
      return;
    }
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
