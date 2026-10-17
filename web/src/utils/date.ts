/**
 * 日期相关工具函数
 */

/**
 * 判断日期（YYYY-MM-DD）是否在当前自然周内（周一起始）
 * 用于日志/报告的编辑规则：本周内可自由修改，跨周需上级审批
 */
export function isInCurrentWeek(dateStr: string): boolean {
  if (!dateStr) return false;
  // 兼容 YYYY-MM-DD 与带时间的 ISO 格式（后端返回 log_date 可能是 2026-01-01T00:00:00.000Z）
  const target = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  // 本周一 00:00
  const day = now.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  // 下周一 00:00（预填本周未来日期也算本周内）
  const nextMonday = new Date(monday.getTime() + 7 * 86400000);
  return target >= monday && target < nextMonday;
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

/** 本周一的日期字符串（YYYY-MM-DD），填日志允许的最早日期 */
export function currentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return formatDate(monday);
}

/** 补零 */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 日期 → YYYY-MM-DD（年月日） */
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 时间字符串/Date → YYYY-MM-DD HH:mm:ss（年月日时分秒） */
export function formatDateTime(ts?: string | Date | null): string {
  if (!ts) return '-';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
