/**
 * 收件箱通知控制器：版本发布、审批结果、反馈回复等站内消息
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';

/**
 * 我的收件箱
 * GET /api/notifications?page=&pageSize=
 */
export async function listNotifications(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const pageNum = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const size = Math.min(50, Math.max(1, parseInt((req.query.pageSize as string) || '20', 10)));
  const totalRes = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*)::int AS cnt FROM notifications WHERE user_id = $1',
    [userId]
  );
  const rows = await queryMany(
    `SELECT * FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT ${size} OFFSET ${(pageNum - 1) * size}`,
    [userId]
  );
  res.json(success({ list: rows, total: totalRes?.cnt || 0, page: pageNum, pageSize: size }));
}

/**
 * 未读通知数（侧边栏徽标）
 * GET /api/notifications/unread-count
 */
export async function unreadCount(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const row = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*)::int AS cnt FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  res.json(success({ count: row?.cnt || 0 }));
}

/**
 * 标记单条已读
 * PUT /api/notifications/:id/read
 */
export async function markRead(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const notificationId = parseInt(req.params.id, 10);
  const row = await queryOne('SELECT id FROM notifications WHERE id = $1 AND user_id = $2', [
    notificationId,
    userId,
  ]);
  if (!row) {
    res.status(404).json(fail('通知不存在'));
    return;
  }
  await queryOne('UPDATE notifications SET is_read = TRUE WHERE id = $1', [notificationId]);
  res.json(success(null, '已标记为已读'));
}

/**
 * 全部标记已读
 * PUT /api/notifications/read-all
 */
export async function markAllRead(req: Request, res: Response) {
  const userId = req.authUser!.id;
  await queryOne('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
  res.json(success(null, '全部已读'));
}
