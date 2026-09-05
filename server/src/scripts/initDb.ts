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

/**
 * 演示数据：8 个演示账号（密码统一 123456）、2 个项目、2 个小组、
 * 近两周工作日志、张三的自定义提示词。
 * 与 server/sql/02_seed_demo.sql 等价，仅在数据库无任何用户时插入（首次初始化），
 * 避免重复部署时按相对日期滚动新增日志。
 */
const DEMO_SEED_SQL = `
-- 1. 用户（bcrypt 哈希对应明文密码: 123456）
INSERT INTO users (username, email, password_hash, display_name, role)
SELECT v.username, v.email, v.hash, v.display_name, v.role
FROM (VALUES
  ('director1', 'director1@demo.com', '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '项目总监', 'director'),
  ('pm1',       'pm1@demo.com',       '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '王经理',   'member'),
  ('pm2',       'pm2@demo.com',       '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '陈经理',   'member'),
  ('leader1',   'leader1@demo.com',   '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '李组长',   'member'),
  ('leader2',   'leader2@demo.com',   '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '周组长',   'member'),
  ('member1',   'member1@demo.com',   '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '张三',     'member'),
  ('member2',   'member2@demo.com',   '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '赵四',     'member'),
  ('member3',   'member3@demo.com',   '$2a$10$RuFKkLMAWxBJKi/94CtM7ewbve3jBTppo1OevPowcZ6tyb6GGbGyW', '孙七',     'member')
) AS v(username, email, hash, display_name, role)
WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.username = v.username);

-- 2. 项目
INSERT INTO projects (name, description, status, created_by, start_date, end_date)
SELECT v.name, v.description, v.status,
       (SELECT id FROM users WHERE username = v.created_by),
       v.start_date::date, v.end_date::date
FROM (VALUES
  ('智慧园区平台', '面向园区运营的一体化管理平台，包含门禁、能耗、访客、招商等模块', 'active', 'director1', CURRENT_DATE - 90, CURRENT_DATE + 90),
  ('大模型项目',   '基于大模型的智能客服系统建设，含知识库、Agent 编排、评测体系',   'active', 'director1', CURRENT_DATE - 60, CURRENT_DATE + 120)
) AS v(name, description, status, created_by, start_date, end_date)
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE projects.name = v.name);

-- 3. 项目小组
INSERT INTO project_groups (project_id, name, leader_id)
SELECT (SELECT id FROM projects WHERE name = v.project_name), v.group_name,
       (SELECT id FROM users WHERE username = v.leader)
FROM (VALUES
  ('智慧园区平台', '前端组', 'leader1'),
  ('智慧园区平台', '后端组', 'leader2')
) AS v(project_name, group_name, leader)
WHERE NOT EXISTS (
  SELECT 1 FROM project_groups pg
  JOIN projects p ON p.id = pg.project_id
  WHERE p.name = v.project_name AND pg.name = v.group_name
);

-- 4. 项目成员
INSERT INTO project_members (project_id, user_id, project_role, group_id)
SELECT (SELECT id FROM projects WHERE name = v.project_name),
       (SELECT id FROM users WHERE username = v.username),
       v.project_role,
       CASE WHEN v.group_name IS NULL THEN NULL
            ELSE (SELECT pg.id FROM project_groups pg
                  JOIN projects p ON p.id = pg.project_id
                  WHERE p.name = v.project_name AND pg.name = v.group_name) END
FROM (VALUES
  ('智慧园区平台', 'pm1',     'manager', NULL),
  ('智慧园区平台', 'leader1', 'leader',  '前端组'),
  ('智慧园区平台', 'leader2', 'leader',  '后端组'),
  ('智慧园区平台', 'member1', 'member',  '前端组'),
  ('智慧园区平台', 'member2', 'member',  '前端组'),
  ('智慧园区平台', 'member3', 'member',  '后端组'),
  ('大模型项目',   'pm2',     'manager', NULL),
  ('大模型项目',   'member1', 'member',  NULL),
  ('大模型项目',   'member2', 'member',  NULL)
) AS v(project_name, username, project_role, group_name)
WHERE NOT EXISTS (
  SELECT 1 FROM project_members pm
  JOIN projects p ON p.id = pm.project_id
  JOIN users u ON u.id = pm.user_id
  WHERE p.name = v.project_name AND u.username = v.username
);

-- 5. 工作日志（近两周）
INSERT INTO work_logs (user_id, project_id, log_date, content, hours)
SELECT (SELECT id FROM users WHERE username = v.username),
       (SELECT id FROM projects WHERE name = v.project_name),
       (CURRENT_DATE - v.days_ago)::date,
       v.content,
       v.hours
FROM (VALUES
  ('member1', '智慧园区平台', 1, '完成登录页开发，联调门禁接口；修复访客列表分页问题；参加前端组周会', 8.0),
  ('member1', '智慧园区平台', 2, '开发能耗监控图表组件，接入实时数据；优化打包体积，首屏减少 30%', 8.0),
  ('member1', '智慧园区平台', 3, '与后端联调访客预约流程；编写组件单测，覆盖率达 80%', 7.5),
  ('member1', '智慧园区平台', 4, '修复 3 个测试环境 bug；评审赵四的 PR；整理前端开发规范文档', 8.0),
  ('member1', '智慧园区平台', 7, '完成招商模块静态页；配合 UI 调整视觉细节', 8.0),
  ('member1', '智慧园区平台', 8, '开发大模型项目知识库前端页面，接入向量检索接口', 6.0),
  ('member1', '智慧园区平台', 9, '智慧园区平台门禁模块集成测试；处理线上反馈 2 个问题', 8.0),
  ('member2', '智慧园区平台', 1, '编写访客预约模块后端接口；完成单元测试', 8.0),
  ('member2', '智慧园区平台', 2, '对接短信平台，访客到访通知上线；修复时区计算 bug', 8.5),
  ('member2', '智慧园区平台', 3, '数据库慢查询优化，访客列表接口耗时从 800ms 降至 120ms', 7.0),
  ('member2', '智慧园区平台', 4, '编写接口文档；参加需求评审会', 8.0),
  ('member2', '智慧园区平台', 8, '大模型项目数据清洗脚本开发，处理 10 万条历史工单', 8.0),
  ('member2', '智慧园区平台', 9, '智慧园区平台访客模块压测，出具压测报告', 8.0),
  ('member3', '智慧园区平台', 1, '后端组开发：门禁设备接入网关开发，支持 3 类设备协议', 8.0),
  ('member3', '智慧园区平台', 2, '网关性能压测与调优，吞吐提升 40%；编写部署文档', 8.0),
  ('member3', '智慧园区平台', 3, '修复设备离线重连问题；评审代码', 8.0),
  ('member3', '智慧园区平台', 4, '开发能耗数据采集定时任务；接入消息队列', 7.5),
  ('member3', '智慧园区平台', 8, '编写网关单元测试；配合运维上线', 8.0),
  ('leader1', '智慧园区平台', 1, '前端组任务拆解与分配；评审 2 个 PR；解决跨域配置问题', 8.0),
  ('leader1', '智慧园区平台', 2, '主持前端组周会；制定组件规范；协助排查打包问题', 8.0),
  ('leader1', '智慧园区平台', 3, '招商模块技术方案评审；跟进成员任务进度', 8.0),
  ('leader1', '智慧园区平台', 8, '大模型项目前端选型调研，输出技术调研报告', 8.0),
  ('leader2', '智慧园区平台', 1, '后端组排期评审；门禁网关方案评审', 8.0),
  ('leader2', '智慧园区平台', 2, '组织后端组代码评审；梳理数据库索引优化项', 8.0),
  ('leader2', '智慧园区平台', 4, '能耗采集链路方案设计；协调设备厂商联调', 8.0),
  ('leader2', '智慧园区平台', 9, '后端组周会；跟进成员联调进度', 8.0),
  ('pm1',     '智慧园区平台', 1, '项目周例会，同步各小组进度；协调资源解决测试环境问题', 8.0),
  ('pm1',     '智慧园区平台', 2, '与客户确认招商模块需求；调整迭代计划', 8.0),
  ('pm1',     '智慧园区平台', 4, '编写项目周报；评估本期风险与人力缺口', 8.0),
  ('pm1',     '智慧园区平台', 9, '项目里程碑评审；制定下阶段计划', 8.0),
  ('pm2',     '大模型项目',   1, '大模型项目启动会；知识库方案评审', 8.0),
  ('pm2',     '大模型项目',   2, '制定评测指标体系；与算法团队对齐接口', 8.0),
  ('pm2',     '大模型项目',   3, '跟进数据清洗进度；Agent 编排方案评审', 8.0),
  ('pm2',     '大模型项目',   4, '项目周报；下阶段排期确认', 8.0),
  ('director1', '智慧园区平台', 1, '听取两个项目汇报，评审里程碑计划', 8.0),
  ('director1', '智慧园区平台', 4, '季度经营分析；项目预算评审', 8.0),
  ('director1', '大模型项目',   2, '大模型项目战略对齐评审；确定二期范围', 8.0)
) AS v(username, project_name, days_ago, content, hours)
WHERE NOT EXISTS (
  SELECT 1 FROM work_logs wl
  JOIN users u ON u.id = wl.user_id
  WHERE u.username = v.username AND wl.log_date = (CURRENT_DATE - v.days_ago)::date
);

-- 6. 用户自定义提示词（演示：张三有一个自定义默认提示词）
INSERT INTO user_prompts (user_id, type, name, content, is_default)
SELECT (SELECT id FROM users WHERE username = 'member1'),
       'log_optimize', '技术风日志优化',
'你是一位资深研发工程师，请将我的工作日志整理为技术团队风格：
1. 按【今日完成】【问题与解决】【明日计划】三段组织
2. 技术细节保留（接口名、指标数字、耗时等）
3. 每条工作用一行简要概括 + 关键量化数据
4. 客观陈述，不夸大

我的日志如下：', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM user_prompts up
  JOIN users u ON u.id = up.user_id
  WHERE u.username = 'member1' AND up.type = 'log_optimize'
);
`;

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

  // 演示数据：仅首次（无用户）时插入
  const cntRes = await query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM users');
  if (cntRes.rows[0].cnt === 0) {
    await query(DEMO_SEED_SQL);
    console.log('演示数据已初始化（8 个演示账号，密码 123456）');
  } else {
    console.log(`数据库已有 ${cntRes.rows[0].cnt} 个用户，跳过演示数据`);
  }

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
