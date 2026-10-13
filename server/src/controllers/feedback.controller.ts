/**
 * 用户反馈控制器：收集使用意见
 * - 所有用户可提交反馈、查看自己的反馈
 * - 项目总监可查看全部反馈并回复处理
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { isDirector } from '../services/permission.service';

/**
 * 提交反馈
 * POST /api/feedback  body: { content, contact? }
 */
export async function createFeedback(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { content, contact } = req.body || {};
  if (!content?.trim()) {
    res.status(400).json(fail('反馈内容不能为空'));
    return;
  }
  if (content.length > 2000) {
    res.status(400).json(fail('反馈内容过长（最多 2000 字）'));
    return;
  }
  const created = await queryOne(
    `INSERT INTO feedback (user_id, content, contact) VALUES ($1, $2, $3) RETURNING *`,
    [userId, content.trim(), contact?.trim() || null]
  );
  // 给所有项目总监发站内通知
  const directors = await queryMany<{ id: number }>(`SELECT id FROM users WHERE role = 'director'`);
  for (const d of directors) {
    await queryOne(
      `INSERT INTO notifications (user_id, title, content, type, link)
       VALUES ($1, $2, $3, 'system', '/admin/feedback')`,
      [d.id, '收到新的用户反馈', '有用户提交了新的使用意见反馈，请前往系统设置查看处理。']
    );
  }
  res.json(success(created, '反馈已提交，感谢您的意见！'));
}

/**
 * 我的反馈列表
 * GET /api/feedback/mine
 */
export async function listMyFeedback(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const rows = await queryMany(
    `SELECT f.*, u.display_name AS user_name
     FROM feedback f JOIN users u ON u.id = f.user_id
     WHERE f.user_id = $1 ORDER BY f.created_at DESC LIMIT 100`,
    [userId]
  );
  res.json(success(rows));
}

/**
 * 全部反馈列表（仅总监）
 * GET /api/admin/feedback?status=
 */
export async function listAllFeedback(req: Request, res: Response) {
  const meId = req.authUser!.id;
  if (!(await isDirector(meId))) {
    res.status(403).json(fail('仅项目总监可查看全部反馈', 403));
    return;
  }
  const { status } = req.query;
  const rows = status
    ? await queryMany(
        `SELECT f.*, u.display_name AS user_name, u.username
         FROM feedback f JOIN users u ON u.id = f.user_id
         WHERE f.status = $1 ORDER BY f.created_at DESC LIMIT 500`,
        [status]
      )
    : await queryMany(
        `SELECT f.*, u.display_name AS user_name, u.username
         FROM feedback f JOIN users u ON u.id = f.user_id
         ORDER BY f.created_at DESC LIMIT 500`
      );
  res.json(success(rows));
}

/**
 * 回复/处理反馈（仅总监）
 * PUT /api/admin/feedback/:id  body: { adminReply?, status? }
 */
export async function replyFeedback(req: Request, res: Response) {
  const meId = req.authUser!.id;
  if (!(await isDirector(meId))) {
    res.status(403).json(fail('仅项目总监可处理反馈', 403));
    return;
  }
  const feedbackId = parseInt(req.params.id, 10);
  const { adminReply, status } = req.body || {};
  const fb = await queryOne('SELECT * FROM feedback WHERE id = $1', [feedbackId]);
  if (!fb) {
    res.status(404).json(fail('反馈不存在'));
    return;
  }
  const newStatus = status === 'processed' ? 'processed' : fb.status;
  const updated = await queryOne(
    `UPDATE feedback SET admin_reply = $1, status = $2 WHERE id = $3 RETURNING *`,
    [adminReply || fb.admin_reply, newStatus, feedbackId]
  );
  // 回复内容变化时给反馈人发通知
  if (adminReply && adminReply !== fb.admin_reply) {
    await queryOne(
      `INSERT INTO notifications (user_id, title, content, type, link)
       VALUES ($1, $2, $3, 'system', '/feedback')`,
      [fb.user_id, '您的反馈已回复', `管理员回复了您的反馈：${adminReply.slice(0, 100)}`]
    );
  }
  res.json(success(updated, '处理完成'));
}
