/**
 * 今日待办控制器（新填报流程）
 * 纯文本清单，按日期归档；用于填写日志时对照待办执行情况生成日志草稿。
 */
import { Request, Response } from 'express';
import { query, queryMany } from '../config/db';
import { success, fail } from '../utils/response';

/**
 * 查询某天的待办列表
 * GET /todos?date=YYYY-MM-DD
 */
export async function listTodos(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const todos = await queryMany(
    `SELECT id, content, status, sort_order
     FROM todo_items
     WHERE user_id = $1 AND todo_date = $2
     ORDER BY sort_order, id`,
    [userId, date]
  );
  res.json(success(todos));
}

/**
 * 保存某天的待办（整份替换）
 * PUT /todos  body: { date: 'YYYY-MM-DD', items: [{ content, status? }] }
 */
export async function saveTodos(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const { date, items } = req.body || {};
  if (!date || typeof date !== 'string') {
    res.status(400).json(fail('日期不能为空'));
    return;
  }
  if (!Array.isArray(items)) {
    res.status(400).json(fail('待办列表格式错误'));
    return;
  }
  const valid = items
    .filter((i: any) => i && String(i.content || '').trim())
    .map((i: any) => ({
      content: String(i.content).trim(),
      status: i.status === 'done' ? 'done' : 'pending',
    }));

  await query('DELETE FROM todo_items WHERE user_id = $1 AND todo_date = $2', [userId, date]);
  if (valid.length > 0) {
    const params: any[] = [];
    const valueTuples: string[] = [];
    valid.forEach((item: any, idx: number) => {
      params.push(userId, date, item.content, item.status, idx);
      const base = idx * 5;
      valueTuples.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    });
    await query(
      `INSERT INTO todo_items (user_id, todo_date, content, status, sort_order) VALUES ${valueTuples.join(', ')}`,
      params
    );
  }

  const saved = await queryMany(
    `SELECT id, content, status, sort_order
     FROM todo_items WHERE user_id = $1 AND todo_date = $2
     ORDER BY sort_order, id`,
    [userId, date]
  );
  res.json(success(saved, valid.length > 0 ? '待办已保存' : '待办已清空'));
}

/**
 * 历史待办列表（按日期归档，含每天完成数/总数）
 * GET /todos/history?days=30
 */
export async function listTodoHistory(req: Request, res: Response) {
  const userId = req.authUser!.id;
  const days = Math.min(180, Math.max(1, parseInt((req.query.days as string) || '30', 10)));
  const rows = await queryMany(
    `SELECT todo_date,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'done')::int AS done
     FROM todo_items
     WHERE user_id = $1
     GROUP BY todo_date
     ORDER BY todo_date DESC
     LIMIT $2`,
    [userId, days]
  );
  res.json(success(rows));
}