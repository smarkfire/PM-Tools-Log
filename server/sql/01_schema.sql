-- ============================================================
-- 日志管理系统 - 数据库表结构
-- 数据库: PostgreSQL 12+
-- 说明: 幂等脚本，可重复执行
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  display_name  VARCHAR(50)  NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'member', -- director(项目总监) / manager / leader / member
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active', -- active / archived
  created_by  INTEGER     NOT NULL REFERENCES users(id),
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 项目小组表
CREATE TABLE IF NOT EXISTS project_groups (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  leader_id  INTEGER     REFERENCES users(id),
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 项目成员表（项目内角色）
CREATE TABLE IF NOT EXISTS project_members (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role  VARCHAR(20) NOT NULL DEFAULT 'member', -- manager / leader / member
  group_id      INTEGER     REFERENCES project_groups(id) ON DELETE SET NULL,
  joined_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- 工作日志表
CREATE TABLE IF NOT EXISTS work_logs (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id        INTEGER     REFERENCES projects(id) ON DELETE SET NULL,
  log_date          DATE        NOT NULL,
  content           TEXT        NOT NULL,
  optimized_content TEXT,
  ai_provider       VARCHAR(20),
  hours             NUMERIC(4,1),
  created_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, log_date)
);

-- 用户自定义提示词表
CREATE TABLE IF NOT EXISTS user_prompts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL,                  -- log_optimize / report / chat
  name       VARCHAR(100) NOT NULL,
  content    TEXT        NOT NULL,
  is_default BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- 系统默认提示词表（全局共享，用户无自定义时使用）
CREATE TABLE IF NOT EXISTS system_prompts (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(20) NOT NULL,                  -- log_optimize / report / chat
  name       VARCHAR(100) NOT NULL,
  content    TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- AI 对话表
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL DEFAULT '新对话',
  provider   VARCHAR(20)  NOT NULL DEFAULT 'qwen',
  created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- AI 消息表
CREATE TABLE IF NOT EXISTS ai_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER     NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,             -- user / assistant
  content         TEXT        NOT NULL,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- 报告表（周报/月报）
CREATE TABLE IF NOT EXISTS reports (
  id             SERIAL PRIMARY KEY,
  type           VARCHAR(20)  NOT NULL,             -- weekly / monthly
  scope          VARCHAR(20)  NOT NULL,             -- personal / project
  user_id        INTEGER      NOT NULL REFERENCES users(id),
  target_user_id INTEGER      REFERENCES users(id),
  project_id     INTEGER      REFERENCES projects(id),
  period_start   DATE         NOT NULL,
  period_end     DATE         NOT NULL,
  content        TEXT         NOT NULL,
  ai_provider    VARCHAR(20),
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 系统配置表（AI Key、菜单开关等）
CREATE TABLE IF NOT EXISTS system_config (
  config_key   VARCHAR(50) PRIMARY KEY,
  config_value TEXT,
  description  VARCHAR(200),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 用户 AI 配置表（用户自己的 API Key）
CREATE TABLE IF NOT EXISTS user_ai_config (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  qwen_api_key       VARCHAR(200),
  deepseek_api_key   VARCHAR(200),
  preferred_provider VARCHAR(20) DEFAULT 'qwen',
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_work_logs_user     ON work_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_project  ON work_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_date     ON work_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv   ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_prompts_user  ON user_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_project    ON reports(project_id);
