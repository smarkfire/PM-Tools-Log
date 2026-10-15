-- ============================================================
-- 日志管理系统 - 数据库升级脚本 v1.0.0 → v1.1.0
-- 适用: 首次部署（2026-09，v1.0.0）的生产库，升级到第二次部署（2026-10，v1.1.0）
-- 数据库: PostgreSQL 12+
-- 说明: 幂等脚本，可重复执行；不修改任何既有业务数据，只增表/增索引/清理废弃配置
-- 执行: psql -h <主机> -U <用户> -d <数据库名> -f upgrade_v1.0_to_v1.1.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 一、新增表（6 张）
-- ------------------------------------------------------------

-- 1. 项目小组多对多表（v1.1.0 跨组协作：一名成员可同时属于多个小组）
CREATE TABLE IF NOT EXISTS project_group_members (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   INTEGER NOT NULL REFERENCES project_groups(id) ON DELETE CASCADE,
  UNIQUE (project_id, user_id, group_id)
);

-- 2. 工作日志-小组多对多表（一篇日志标记涉及的小组，并记录各小组分配的工时）
CREATE TABLE IF NOT EXISTS work_log_groups (
  id       SERIAL PRIMARY KEY,
  log_id   INTEGER NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES project_groups(id) ON DELETE CASCADE,
  hours    NUMERIC(4,1), -- 该组在本日志中的投入工时（默认均摊，用户可修改）
  UNIQUE (log_id, group_id)
);

-- 3. 跨周修改审批表（本周以前的日志/报告需提交申请，上级审批通过后方可修改一次）
CREATE TABLE IF NOT EXISTS edit_approvals (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- 申请人
  target_type  VARCHAR(20) NOT NULL,               -- log / report
  target_id    INTEGER NOT NULL,
  reason       TEXT NOT NULL,                      -- 申请原因
  status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / approved / rejected / used
  approver_id  INTEGER REFERENCES users(id),       -- 审批人
  approve_note TEXT,                              -- 审批意见
  approved_at  TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. 用户反馈表（使用意见收集，管理员回复并标记已处理）
CREATE TABLE IF NOT EXISTS feedback (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  contact     VARCHAR(100),                        -- 联系方式（可选）
  status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / processed
  admin_reply TEXT,                               -- 管理员回复
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. 版本记录表（软件版本更新历史，发布后自动通知全员）
CREATE TABLE IF NOT EXISTS app_versions (
  id          SERIAL PRIMARY KEY,
  version     VARCHAR(20) NOT NULL,
  title       VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  released_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. 收件箱通知表（版本发布、审批结果等站内消息）
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  content    TEXT NOT NULL,
  type       VARCHAR(20) NOT NULL DEFAULT 'system', -- system / version / approval
  link       VARCHAR(200),                          -- 可选跳转路径
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 二、新增索引（7 个）
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_project_group_members_group ON project_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_project_group_members_user  ON project_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_work_log_groups_log        ON work_log_groups(log_id);
CREATE INDEX IF NOT EXISTS idx_work_log_groups_group      ON work_log_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_edit_approvals_user        ON edit_approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user         ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_feedback_user              ON feedback(user_id);

-- ------------------------------------------------------------
-- 三、废弃配置清理
-- ------------------------------------------------------------

-- v1.0.0 的全局菜单开关（menu_*）已被 v1.1.0 的"角色菜单可见性"（role_menus）取代，
-- v1.1.0 代码不再读取这些键，删除以免误导。可安全回滚：v1.0.0 代码按缺省=可见处理。
DELETE FROM system_config WHERE config_key LIKE 'menu_%';

-- 若库经历过中间版本（曾短暂加入项目团队介绍列，正式版已移除该功能），此处清理该列；
-- 纯 v1.0.0 库无此列，本行为空操作（NO-OP）。
ALTER TABLE projects DROP COLUMN IF EXISTS team_intro;

-- 说明：菜单可见性新配置 role_menus 无需预置数据——未配置时所有角色默认全部菜单可见，
-- 管理员可在"系统设置 → 角色菜单可见性"中按角色维护。

COMMIT;

-- ------------------------------------------------------------
-- 四、升级结果自查（执行后应返回 6 行）
-- ------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public'
--    AND table_name IN ('project_group_members','work_log_groups','edit_approvals',
--                       'feedback','app_versions','notifications')
--  ORDER BY table_name;
