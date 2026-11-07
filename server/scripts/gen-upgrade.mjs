// 一次性生成脚本：从 initDb.ts 提取 log_review 提示词，生成 v1.2→v1.3 升级 SQL
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('/workspace/server/src/scripts/initDb.ts', 'utf8');
const m = src.match(/type: 'log_review',\s*\n\s*name: '([^']+)',\s*\n\s*content: `([\s\S]*?)`,\s*\n\s*\},/);
if (!m) { console.error('未找到 log_review 种子'); process.exit(1); }
const name = m[1];
let content = m[2].replace(/\\\\/g, '\\');
if (content.includes('$prompt$')) { console.error('内容含定界符，需换标签'); process.exit(1); }

const sql = `-- ============================================================
-- MateLog 脉络 数据库升级脚本：v1.2.x → v1.3.0
-- 生成依据：server/src/scripts/initDb.ts（与全新部署自动迁移完全一致）
-- 变更内容（纯新增，不修改、不删除任何已有业务数据）：
--   1. 新增待办表 todo_items（新版填报-今日待办 / 历史待办）
--   2. 新增/更新系统提示词 log_review（AI 日志质量检查与生成规范，随版本自动更新）
-- 特性：幂等，可重复执行，执行前后均不影响历史日志
-- 用法：在 Supabase SQL Editor 或 psql 中整体执行一次即可
-- ============================================================

-- ------------------------------------------------------------
-- 1. 新增待办表 todo_items（新版填报-今日待办）
--    已存在则跳过（IF NOT EXISTS），老库历史数据不受影响
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS todo_items (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  todo_date  DATE        NOT NULL,
  content    TEXT        NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending 未完成 / done 已完成
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. 新增/更新系统提示词 log_review（AI 日志质量检查与好日志生成规范）
--    已存在则更新为最新内容（保证拿到 v1.3.0 定稿规范），不存在则插入
-- ------------------------------------------------------------
UPDATE system_prompts
SET name = '${name}', content = $prompt$
${content}$prompt$
WHERE type = 'log_review';

INSERT INTO system_prompts (type, name, content)
SELECT 'log_review', '${name}', $prompt$
${content}$prompt$
WHERE NOT EXISTS (SELECT 1 FROM system_prompts WHERE type = 'log_review');

-- ------------------------------------------------------------
-- 3. 执行后验证（应在 psql 输出中确认）
-- ------------------------------------------------------------
-- 3.1 待办表已创建（返回 t）：
-- SELECT to_regclass('public.todo_items') IS NOT NULL AS todo_items_ready;
--
-- 3.2 质量检查提示词已就绪（返回 1 行，content 长度 > 1000）：
-- SELECT id, type, name, LENGTH(content) AS content_len, is_active
-- FROM system_prompts WHERE type = 'log_review';
--
-- 3.3 既有数据完好（示例：历史日志条数应与升级前一致）：
-- SELECT COUNT(*) FROM work_logs;
`;

writeFileSync('/workspace/server/sql/upgrade_v1.2_to_v1.3.sql', sql);
console.log('已生成 upgrade_v1.2_to_v1.3.sql，提示词长度:', content.length);
