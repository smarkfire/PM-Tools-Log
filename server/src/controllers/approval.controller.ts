/**
 * 修改审批控制器：日志/报告超过本周后的修改申请与审批
 *
 * 规则：
 * - 本周内的日志/报告可自由编辑，无需审批
 * - 跨周修改需提交申请，由上级审批（通过后仅可修改一次）
 * - 审批人："更高级领导"：
 *     组员    → 所在组组长或项目经理
 *     小组长  → 所在项目的项目经理
 *     项目经理 → 项目总监
 *     项目总监 → 无需审批（可直接修改）
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';

/** 判断 approver 是否有资格审批 applicant 的修改申请 */
export async function canApprove(approverId: number, applicantId: number): Promise<boolean> {
  if (approverId === applicantId) return false;
  const approver = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [approverId]);
  if (!approver) return false;
  // 系统管理员（项目总监/管理员）可审批所有人
  if (approver.role === 'director' || approver.role === 'admin') return true;
  // 审批人是申请人所在项目的项目经理（且申请人在该项目不是经理）
  const asManager = await queryOne(
    `SELECT 1 FROM project_members pm1
     JOIN project_members pm2 ON pm2.project_id = pm1.project_id
     WHERE pm1.user_id = $1 AND pm1.project_role = 'manager'
       AND pm2.user_id = $2 AND pm2.project_role != 'manager'`,
    [approverId, applicantId]
  );
  if (asManager) return true;
  // 审批人是申请人所在小组的组长
  const asLeader = await queryOne(
    `SELECT 1 FROM project_members pm1
     JOIN project_members pm2 ON pm2.group_id = pm1.group_id AND pm2.project_id = pm1.project_id
     WHERE pm1.user_id = $1 AND pm1.project_role = 'leader' AND pm1.group_id IS NOT NULL
       AND pm2.user_id = $2 AND pm2.project_role = 'member'`,
    [approverId, applicantId]
  );
  return !!asLeader;
}

/** 获取修改目标的摘要信息（用于列表展示） */
async function getTargetSummary(targetType: string, targetId: number): Promise<string> {
  if (targetType === 'log') {
    const log = await queryOne<{ log_date: string; content: string }>(
      `SELECT TO_CHAR(log_date, 'YYYY-MM-DD') AS log_date, LEFT(content, 60) AS content FROM work_logs WHERE id = $1`,
      [targetId]
    );
    return log ? `日志 ${log.log_date}：${log.content}` : '日志（已删除）';
  }
  const report = await queryOne<{ type: string; period_start: string; period_end: string }>(
    `SELECT type, TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start, TO_CHAR(period_end, 'YYYY-MM-DD') AS period_end FROM reports WHERE id = $1`,
    [targetId]
  );
  if (!report) return '报告（已删除）';
  return `${report.type === 'weekly' ? '周报' : '月报'}（${report.period_start} ~ ${report.period_end}）`;
}

/**
 * 提交修改申请
 * POST /api/approvals  body: { targetType: 'log'|'report', targetId, reason }
 */
export async function createApproval(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { targetType, targetId, reason } = req.body || {};
  if (!['log', 'report'].includes(targetType) || !targetId || !reason?.trim()) {
    res.status(400).json(fail('目标类型、目标ID和申请原因为必填项'));
    return;
  }
  const me = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  if (me?.role === 'director' || me?.role === 'admin') {
    res.status(400).json(fail('您是系统管理员，可直接修改任意自己的日志/报告，无需审批'));
    return;
  }
  // 校验目标是本人所有
  if (targetType === 'log') {
    const log = await queryOne<{ user_id: number }>(
      'SELECT user_id FROM work_logs WHERE id = $1', [targetId]
    );
    if (!log) {
      res.status(404).json(fail('目标日志不存在'));
      return;
    }
    if (log.user_id !== userId) {
      res.status(403).json(fail('只能申请修改自己的日志', 403));
      return;
    }
  } else {
    const report = await queryOne<{ user_id: number }>(
      'SELECT user_id FROM reports WHERE id = $1', [targetId]
    );
    if (!report) {
      res.status(404).json(fail('目标报告不存在'));
      return;
    }
    if (report.user_id !== userId) {
      res.status(403).json(fail('只能申请修改自己生成的报告', 403));
      return;
    }
  }
  // 同一目标不允许重复提交待审批的申请
  const dup = await queryOne<{ id: number }>(
    `SELECT id FROM edit_approvals
     WHERE user_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'pending'`,
    [userId, targetType, targetId]
  );
  if (dup) {
    res.status(400).json(fail('该目标已有待审批的申请，请等待审批结果'));
    return;
  }
  const created = await queryOne(
    `INSERT INTO edit_approvals (user_id, target_type, target_id, reason)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, targetType, targetId, reason.trim()]
  );
  res.json(success(created, '申请已提交，等待上级审批'));
}

/**
 * 我的申请列表
 * GET /api/approvals/mine
 */
export async function listMyApprovals(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const rows = await queryMany(
    `SELECT a.*, u.display_name AS user_name
     FROM edit_approvals a JOIN users u ON u.id = a.user_id
     WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 100`,
    [userId]
  );
  const list = [];
  for (const row of rows) {
    list.push({ ...row, target_summary: await getTargetSummary(row.target_type, row.target_id) });
  }
  res.json(success(list));
}

/**
 * 待我审批的列表（我的下属提交的申请）
 * GET /api/approvals/pending
 */
export async function listPendingApprovals(req: Request, res: Response) {
  const meId = req.authUser!.id;
  const rows = await queryMany(
    `SELECT a.*, u.display_name AS user_name, u.username
     FROM edit_approvals a JOIN users u ON u.id = a.user_id
     WHERE a.status = 'pending' ORDER BY a.created_at DESC LIMIT 200`
  );
  // 逐条判断审批资格（申请量小，可接受）
  const list = [];
  for (const row of rows) {
    if (await canApprove(meId, row.user_id)) {
      list.push({ ...row, target_summary: await getTargetSummary(row.target_type, row.target_id) });
    }
  }
  res.json(success(list));
}

/**
 * 审批处理
 * PUT /api/approvals/:id  body: { approved: boolean, note?: string }
 */
export async function handleApproval(req: Request, res: Response) {
  const meId = req.authUser!.id;
  const approvalId = parseInt(req.params.id, 10);
  const { approved, note } = req.body || {};
  if (typeof approved !== 'boolean') {
    res.status(400).json(fail('请指定审批结果（通过/拒绝）'));
    return;
  }
  const approval = await queryOne('SELECT * FROM edit_approvals WHERE id = $1', [approvalId]);
  if (!approval) {
    res.status(404).json(fail('申请不存在'));
    return;
  }
  if (approval.status !== 'pending') {
    res.status(400).json(fail('该申请已处理过，不可重复操作'));
    return;
  }
  if (!(await canApprove(meId, approval.user_id))) {
    res.status(403).json(fail('您无权审批该申请（需为申请人的上级领导）', 403));
    return;
  }
  const targetSummary = await getTargetSummary(approval.target_type, approval.target_id);
  const updated = await queryOne(
    `UPDATE edit_approvals
     SET status = $1, approver_id = $2, approve_note = $3, approved_at = NOW()
     WHERE id = $4 RETURNING *`,
    [approved ? 'approved' : 'rejected', meId, note || null, approvalId]
  );
  // 给申请人发站内通知
  await queryOne(
    `INSERT INTO notifications (user_id, title, content, type)
     VALUES ($1, $2, $3, 'approval')`,
    [
      approval.user_id,
      approved ? '修改申请已通过' : '修改申请被拒绝',
      approved
        ? `您的「${targetSummary}」修改申请已通过，现在可以前往修改（通过后仅可修改一次）。${note ? `审批意见：${note}` : ''}`
        : `您的「${targetSummary}」修改申请被拒绝。${note ? `审批意见：${note}` : ''}`,
    ]
  );
  res.json(success(updated, approved ? '已通过' : '已拒绝'));
}
