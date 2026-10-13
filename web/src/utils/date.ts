/**
 * 日期相关工具函数
 */

/**
 * 判断日期（YYYY-MM-DD）是否在当前自然周内（周一起始）
 * 用于日志/报告的编辑规则：本周内可自由修改，跨周需上级审批
 */
export function isInCurrentWeek(dateStr: string): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  // 本周一 00:00
  const day = now.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return target >= monday;
}

/** 判断时间戳/时间字符串是否在当前自然周内 */
export function timestampInCurrentWeek(ts?: string | Date): boolean {
  if (!ts) return false;
  const target = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0);
  return target >= monday;
}
