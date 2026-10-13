/**
 * 版本管理控制器：记录软件版本更新历史
 * - 所有用户可查看版本历史
 * - 项目总监发布新版本，发布后自动给所有用户收件箱发送更新通知
 */
import { Request, Response } from 'express';
import { queryMany, queryOne } from '../config/db';
import { success, fail } from '../utils/response';
import { isDirector } from '../services/permission.service';

/**
 * 版本历史（所有用户可见，最新在前）
 * GET /api/versions
 */
export async function listVersions(_req: Request, res: Response) {
  const rows = await queryMany(
    'SELECT id, version, title, description, released_at FROM app_versions ORDER BY id DESC LIMIT 20'
  );
  res.json(success(rows));
}

/**
 * 管理端版本列表（总监）
 * GET /api/admin/versions
 */
export async function listAdminVersions(req: Request, res: Response) {
  const meId = req.authUser!.id;
  if (!(await isDirector(meId))) {
    res.status(403).json(fail('仅项目总监可管理版本', 403));
    return;
  }
  const rows = await queryMany(
    'SELECT * FROM app_versions ORDER BY id DESC LIMIT 100'
  );
  res.json(success(rows));
}

/**
 * 发布新版本（总监）：写入版本记录 + 给所有用户发收件箱通知
 * POST /api/admin/versions  body: { version, title, description }
 */
export async function releaseVersion(req: Request, res: Response) {
  const meId = req.authUser!.id;
  if (!(await isDirector(meId))) {
    res.status(403).json(fail('仅项目总监可发布版本', 403));
    return;
  }
  const { version, title, description } = req.body || {};
  if (!version?.trim() || !title?.trim() || !description?.trim()) {
    res.status(400).json(fail('版本号、标题和更新说明为必填项'));
    return;
  }
  const dup = await queryOne('SELECT id FROM app_versions WHERE version = $1', [version.trim()]);
  if (dup) {
    res.status(400).json(fail('该版本号已存在'));
    return;
  }
  const created = await queryOne(
    `INSERT INTO app_versions (version, title, description) VALUES ($1, $2, $3) RETURNING *`,
    [version.trim(), title.trim(), description.trim()]
  );
  // 给所有用户发收件箱通知
  const usersCnt = await queryOne<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users');
  await queryOne(
    `INSERT INTO notifications (user_id, title, content, type)
     SELECT id, $1, $2, 'version' FROM users`,
    [`新版本 ${version.trim()} 发布`, `${title.trim()}\n\n${description.trim()}`]
  );
  res.json(success({ ...created, notified_users: usersCnt?.cnt || 0 }, `版本已发布，已通知 ${usersCnt?.cnt || 0} 位用户`));
}

/**
 * 删除版本记录（总监）
 * DELETE /api/admin/versions/:id
 */
export async function deleteVersion(req: Request, res: Response) {
  const meId = req.authUser!.id;
  if (!(await isDirector(meId))) {
    res.status(403).json(fail('仅项目总监可管理版本', 403));
    return;
  }
  const versionId = parseInt(req.params.id, 10);
  const row = await queryOne('SELECT id FROM app_versions WHERE id = $1', [versionId]);
  if (!row) {
    res.status(404).json(fail('版本不存在'));
    return;
  }
  await queryOne('DELETE FROM app_versions WHERE id = $1', [versionId]);
  res.json(success(null, '版本记录已删除'));
}
