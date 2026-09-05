/**
 * 数据库初始化脚本
 * 创建日志管理系统的所有表结构 + 种子数据（幂等，可重复执行）
 *
 * 表结构：
 * - users             用户表
 * - projects          项目表
 * - project_groups    项目小组表
 * - project_members   项目成员表
 * - work_logs         工作日志表
 * - user_prompts      用户自定义提示词表
 * - system_prompts    系统默认提示词表（用户无自定义时使用）
 * - system_config     系统配置表（AI Key、菜单开关）
 * - user_ai_config    用户 AI 配置表（用户自己的 API Key）
 * - ai_conversations  AI对话表
 * - ai_messages       AI消息表
 * - reports           报告表
 */
import { query, pool } from '../config/db';

const CREATE_TABLES_SQL = `
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
  created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
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
  user_id        INTEGER     NOT NULL REFERENCES users(id),
  target_user_id INTEGER     REFERENCES users(id),
  project_id     INTEGER     REFERENCES projects(id),
  period_start   DATE        NOT NULL,
  period_end     DATE        NOT NULL,
  content        TEXT        NOT NULL,
  ai_provider    VARCHAR(20),
  created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
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
`;

/** 系统默认提示词种子数据（用户未自定义提示词时使用） */
const SYSTEM_PROMPT_SEEDS: { type: string; name: string; content: string }[] = [
  {
    type: 'log_optimize',
    name: '系统默认-日志优化',
    content: `你是一位资深的项目管理助手，擅长将零散的工作记录整理成专业、易读的工作日志。

请将用户提供的工作日志内容进行优化，要求：
1. 结构清晰：按"今日完成工作"、"遇到的问题及解决方案"、"明日计划"等维度组织（可根据实际内容调整）
2. 突出成果和工作量：量化描述（如完成数量、进度百分比、耗时等）
3. 语言专业简洁，使用业务化表达
4. 保留原始信息，不编造内容
5. 直接输出优化后的日志内容，不要任何额外解释

工作日志内容如下：`,
  },
  {
    type: 'report',
    name: '系统默认-报告生成',
    content: `你是一位专业的项目管理助手，请根据下方的工作日志记录，生成一份结构清晰的{REPORT_TYPE}。

要求：
1. 使用 Markdown 格式输出
2. 包含以下部分：概述（总体进展与成果总结）、主要工作内容（按人或按主题分组，条理清晰）、关键成果与亮点（量化数据）、问题与风险、下周/下月计划建议
3. 突出工作量与成果，用数据说话
4. 语言专业、简洁、易读
5. 不要编造日志中不存在的内容

工作日志记录如下：
`,
  },
  {
    type: 'chat',
    name: '系统默认-AI对话',
    content: `你是"日志管理助手"，一位专业的项目管理 AI 助手。你可以帮助用户：
1. 查询和分析工作日志数据（基于下方提供的日志上下文）
2. 总结工作进展、提炼成果
3. 起草周报/月报片段
4. 提供工作改进建议

注意：你只能基于"日志数据上下文"中提供的信息回答与日志相关的问题，不得编造数据。如果上下文中没有相关信息，请如实告知。上下文范围之外的数据你无权访问。`,
  },
];

/** 系统配置种子数据 */
const CONFIG_SEEDS: { key: string; value: string; desc: string }[] = [
  // 菜单开关（管理员可控制功能菜单对用户是否开放）
  { key: 'menu_logs_write', value: 'true', desc: '填写日志菜单开关' },
  { key: 'menu_logs', value: 'true', desc: '我的日志菜单开关' },
  { key: 'menu_logs_all', value: 'true', desc: '团队日志菜单开关' },
  { key: 'menu_projects', value: 'true', desc: '项目管理菜单开关' },
  { key: 'menu_reports', value: 'true', desc: '报告中心菜单开关' },
  { key: 'menu_chat', value: 'true', desc: 'AI助手菜单开关' },
  { key: 'menu_prompts', value: 'true', desc: '提示词配置菜单开关' },
  { key: 'menu_users', value: 'true', desc: '用户管理菜单开关' },
  { key: 'menu_ai_settings', value: 'true', desc: '用户AI配置菜单开关' },
  // 系统 AI 配置（管理员可在界面修改；留空则回退到 .env）
  { key: 'qwen_api_key', value: '', desc: '通义千问 API Key' },
  { key: 'qwen_base_url', value: 'https://dashscope.aliyuncs.com/compatible-mode/v1', desc: '通义千问 Base URL' },
  { key: 'qwen_model', value: 'qwen-plus', desc: '通义千问模型' },
  { key: 'deepseek_api_key', value: '', desc: 'DeepSeek API Key' },
  { key: 'deepseek_base_url', value: 'https://api.deepseek.com/v1', desc: 'DeepSeek Base URL' },
  { key: 'deepseek_model', value: 'deepseek-chat', desc: 'DeepSeek模型' },
];

async function initDb() {
  console.log('开始初始化数据库...');
  await query(CREATE_TABLES_SQL);
  console.log('所有表创建完成');

  // 种子数据（幂等插入，显式类型转换避免参数类型推导不一致）
  for (const p of SYSTEM_PROMPT_SEEDS) {
    await query(
      `INSERT INTO system_prompts (type, name, content)
       SELECT $1::varchar, $2::varchar, $3::text
       WHERE NOT EXISTS (SELECT 1 FROM system_prompts WHERE type = $1::varchar)`,
      [p.type, p.name, p.content]
    );
  }
  console.log(`系统默认提示词已初始化（${SYSTEM_PROMPT_SEEDS.length} 条）`);

  for (const c of CONFIG_SEEDS) {
    await query(
      `INSERT INTO system_config (config_key, config_value, description)
       SELECT $1::varchar, $2::text, $3::varchar
       WHERE NOT EXISTS (SELECT 1 FROM system_config WHERE config_key = $1::varchar)`,
      [c.key, c.value, c.desc]
    );
  }
  console.log(`系统配置已初始化（${CONFIG_SEEDS.length} 项）`);

  const res = await query('SELECT COUNT(*)::int AS cnt FROM users');
  console.log(`当前用户数: ${res.rows[0].cnt}`);
  console.log('数据库初始化成功');
}

if (require.main === module) {
  // 作为独立脚本运行时才关闭连接池
  initDb()
    .then(async () => {
      await pool.end();
    })
    .catch((err) => {
      console.error('数据库初始化失败:', err);
      process.exit(1);
    });
}

export default initDb;
