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
--   1. work_logs 新增 source（日志来源 v1/v2）、ai_score（AI 质检得分）两列
--   2. 新增待办表 todo_items（新版填报-今日待办 / 历史待办）
--   3. 新增/更新系统提示词 log_review（AI 日志质量检查与生成规范，随版本自动更新）
-- 特性：幂等，可重复执行，执行前后均不影响历史日志
-- 用法：在 Supabase SQL Editor 或 psql 中整体执行一次即可
-- ============================================================

-- ------------------------------------------------------------
-- 1. work_logs 新增两列（新版对话式填报：项目写入内容、记录 AI 得分）
--    历史日志自动归为 v1（source 默认值），得分列默认 NULL，
--    已有业务数据与唯一约束 (user_id, log_date) 均不受影响
-- ------------------------------------------------------------
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS source   VARCHAR(10) NOT NULL DEFAULT 'v1';
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS ai_score INTEGER;

-- ------------------------------------------------------------
-- 2. 新增待办表 todo_items（新版填报-今日待办）
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
-- 3. 新增/更新系统提示词 log_review（AI 日志质量检查与好日志生成规范）
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
-- 4. 执行后验证（应在 psql 输出中确认）
-- ------------------------------------------------------------
-- 4.1 work_logs 两列已就绪（应返回 source / ai_score 两行）：
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'work_logs' AND column_name IN ('source', 'ai_score');
--
-- 4.2 待办表已创建（返回 t）：
-- SELECT to_regclass('public.todo_items') IS NOT NULL AS todo_items_ready;
--
-- 4.3 质量检查提示词已就绪（返回 1 行，content 长度 > 1000）：
-- SELECT id, type, name, LENGTH(content) AS content_len, is_active
-- FROM system_prompts WHERE type = 'log_review';
--
-- 4.4 既有数据完好（示例：历史日志条数应与升级前一致）：
-- SELECT COUNT(*) FROM work_logs;
`;

writeFileSync('/workspace/server/sql/upgrade_v1.2_to_v1.3.sql', sql);
console.log('已生成 upgrade_v1.2_to_v1.3.sql，提示词长度:', content.length);
