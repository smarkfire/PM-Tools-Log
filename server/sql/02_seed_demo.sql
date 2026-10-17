-- ============================================================
-- MateLog 脉络 - 演示数据
-- 数据库: PostgreSQL 12+
-- 说明: 幂等脚本，可重复执行；所有演示账号密码统一为 PmLog@2026!Secure
--
-- 演示账号一览：
--   director1 / PmLog@2026!Secure  项目总监（查看所有数据）
--   pm1       / PmLog@2026!Secure  王经理（"智慧园区平台"项目经理）
--   pm2       / PmLog@2026!Secure  陈经理（"大模型项目"项目经理）
--   leader1   / PmLog@2026!Secure  李组长（"智慧园区平台"前端组组长）
--   leader2   / PmLog@2026!Secure  周组长（"智慧园区平台"后端组组长）
--   member1   / PmLog@2026!Secure  张三（前端组组员）
--   member2   / PmLog@2026!Secure  赵四（前端组组员）
--   member3   / PmLog@2026!Secure  孙七（后端组组员）
-- ============================================================

-- bcrypt 哈希对应的明文密码: PmLog@2026!Secure
-- $2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW

-- ---------- 1. 用户 ----------
INSERT INTO users (username, email, password_hash, display_name, role)
SELECT v.username, v.email, v.hash, v.display_name, v.role
FROM (VALUES
  ('director1', 'director1@demo.com', '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '项目总监', 'director'),
  ('pm1',       'pm1@demo.com',       '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '王经理',   'member'),
  ('pm2',       'pm2@demo.com',       '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '陈经理',   'member'),
  ('leader1',   'leader1@demo.com',   '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '李组长',   'member'),
  ('leader2',   'leader2@demo.com',   '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '周组长',   'member'),
  ('member1',   'member1@demo.com',   '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '张三',     'member'),
  ('member2',   'member2@demo.com',   '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '赵四',     'member'),
  ('member3',   'member3@demo.com',   '$2a$10$1BL5GhWamsts6jroKlTMIOkSI8vu5mKZN8EMHGTqhqOAguJCYPWxW', '孙七',     'member')
) AS v(username, email, hash, display_name, role)
WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.username = v.username);

-- ---------- 2. 项目 ----------
INSERT INTO projects (name, description, status, created_by, start_date, end_date)
SELECT v.name, v.description, v.status,
       (SELECT id FROM users WHERE username = v.created_by),
       v.start_date::date, v.end_date::date
FROM (VALUES
  ('智慧园区平台', '面向园区运营的一体化管理平台，包含门禁、能耗、访客、招商等模块', 'active', 'director1', CURRENT_DATE - 90, CURRENT_DATE + 90),
  ('大模型项目',   '基于大模型的智能客服系统建设，含知识库、Agent 编排、评测体系',   'active', 'director1', CURRENT_DATE - 60, CURRENT_DATE + 120)
) AS v(name, description, status, created_by, start_date, end_date)
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE projects.name = v.name);

-- ---------- 3. 项目小组 ----------
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

-- ---------- 4. 项目成员 ----------
INSERT INTO project_members (project_id, user_id, project_role, group_id)
SELECT (SELECT id FROM projects WHERE name = v.project_name),
       (SELECT id FROM users WHERE username = v.username),
       v.project_role,
       CASE WHEN v.group_name IS NULL THEN NULL
            ELSE (SELECT pg.id FROM project_groups pg
                  JOIN projects p ON p.id = pg.project_id
                  WHERE p.name = v.project_name AND pg.name = v.group_name) END
FROM (VALUES
  -- 智慧园区平台
  ('智慧园区平台', 'pm1',     'manager', NULL),
  ('智慧园区平台', 'leader1', 'leader',  '前端组'),
  ('智慧园区平台', 'leader2', 'leader',  '后端组'),
  ('智慧园区平台', 'member1', 'member',  '前端组'),
  ('智慧园区平台', 'member2', 'member',  '前端组'),
  ('智慧园区平台', 'member3', 'member',  '后端组'),
  -- 大模型项目
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

-- ---------- 5. 工作日志（近两周） ----------
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

-- ---------- 6. 用户自定义提示词（演示：张三有一个自定义默认提示词） ----------
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

-- ============================================================
-- 场景提示词组（幂等：按 用户+名称 判断，可对已有库重复执行）
-- 角色类日志优化（数据工程 / 智能体开发 / 需求分析）
-- 周报类（公司领导 / 甲方项目组 / 集团管理部门 / 公司简报）
-- ============================================================

INSERT INTO user_prompts (user_id, type, name, content, is_default)
SELECT (SELECT id FROM users WHERE username = v.username),
       v.type, v.name, v.content, FALSE
FROM (VALUES
  -- 1. 需求分析日志优化（张三 member1）
  ('member1', 'log_optimize', '需求分析日志优化',
'你是一位资深需求分析师，请将我的工作记录整理为专业的工作日志：
1. 按【今日完成】【问题与解决】【明日计划】三段组织
2. 突出需求分析要素：需求调研（对象/方式/结论）、需求文档（PRD 章节与评审状态）、原型与流程设计、需求评审与变更、与干系人的对齐结论
3. 明确需求状态：调研中/已评审/开发中/已验收，注明需求编号与优先级
4. 记录关键决策与依据（为什么做/不做、方案取舍），便于追溯
5. 客观陈述，语言业务化、结论清晰

我的工作记录如下：'),
  -- 2. 数据工程日志优化（赵四 member2）
  ('member2', 'log_optimize', '数据工程日志优化',
'你是一位资深数据工程专家，请将我的工作记录整理为专业的工作日志：
1. 按【今日完成】【问题与解决】【明日计划】三段组织
2. 突出数据工程要素：数据管道/ETL 任务、数据模型与表结构、调度与依赖、数据质量（一致性/完整性/及时性）、数据量与性能指标
3. 量化优先：处理数据量（万/亿行）、任务耗时、失败重试次数、存储与计算资源变化
4. 排障过程按 现象→定位→根因→措施 组织，便于复用
5. 客观陈述，不夸大，保留关键技术细节

我的工作记录如下：'),
  -- 3. 智能体开发日志优化（孙七 member3）
  ('member3', 'log_optimize', '智能体开发日志优化',
'你是一位资深 AI 应用工程师，请将我的工作记录整理为专业的工作日志：
1. 按【今日完成】【问题与解决】【明日计划】三段组织
2. 突出智能体开发要素：提示词设计与调优、Agent 编排与工具调用、知识库/RAG（召回、切片策略）、模型效果评测（准确率/幻觉率/时延）、上下文与成本优化
3. 量化优先：评测集规模、指标提升幅度（如召回率 62%→78%）、Token 成本变化、并发与时延数据
4. 记录关键实验结论（有效与无效的方案都要写），便于迭代复用
5. 客观陈述，不编造评测数据

我的工作记录如下：'),
  -- 4. 公司领导周报（项目总监 director1）
  ('director1', 'report', '公司领导周报',
'你是汇报助手，请根据项目工作日志，生成呈报公司领导的{REPORT_TYPE}。阅读对象是公司高层，关注经营结果与风险，语言精炼、结论先行。
要求：
1. 使用 Markdown 格式，篇幅控制在一页以内
2. 结构：一、总体进展（一句话结论 + 完成率/里程碑状态）；二、关键成果（3~5 条，量化）；三、问题与需领导决策事项（每条附建议方案）；四、下周重点
3. 只写领导关心的：里程碑、交付物、资源缺口、重大风险，技术细节一笔带过
4. 不编造数据；无决策事项则省略该节

工作日志记录如下：
'),
  -- 5. 甲方项目组周报（项目总监 director1）
  ('director1', 'report', '甲方项目组周报',
'你是项目汇报助手，请根据项目工作日志，生成提交甲方项目组的{REPORT_TYPE}。阅读对象是甲方项目负责人与监理，语气正式、要素完整、可核查。
要求：
1. 使用 Markdown 格式
2. 结构：一、本周计划完成情况（计划 vs 实际，含偏差说明）；二、本周实际工作内容（按模块/小组分组）；三、下周工作计划（任务+责任人+完成时间）；四、需甲方协调配合事项；五、风险与问题
3. 用合同/SOW 与里程碑语言表述，交付物写清名称与验收标准
4. 数据必须来自日志，不虚构进度

工作日志记录如下：
'),
  -- 6. 集团管理部门周报（项目总监 director1）
  ('director1', 'report', '集团管理部门周报',
'你是汇报助手，请根据项目工作日志，生成报送集团管理部门的{REPORT_TYPE}。阅读对象是集团职能管理部门，关注合规、规范与整体经营指标，格式规范严谨。
要求：
1. 使用 Markdown 格式
2. 结构：一、项目基本情况（阶段/投资执行/人员到位）；二、本期进展摘要（对照计划）；三、指标数据（工作量、投入工时、预算执行率等，用表格）；四、重大事项报告（风险/变更/合规事项）；五、下期工作安排
3. 表述规范正式，避免口语与技术黑话；数据用表格呈现
4. 不编造数据，缺失指标标注"待补充"

工作日志记录如下：
'),
  -- 7. 公司简报（项目总监 director1）
  ('director1', 'report', '公司简报',
'你是企业内刊编辑，请根据项目工作日志，生成用于公司内部简报的{REPORT_TYPE}片段。阅读对象是全公司同事，风格轻快、有温度、易传播。
要求：
1. 使用 Markdown 格式，300~500 字
2. 结构：本期亮点（2~3 条，故事化表达）+ 数据速览（一行量化成绩）+ 团队风采（如有协作/攻坚事例点一句）
3. 弱化问题与风险（另行内部汇报），突出进展、成果与团队付出
4. 语言通俗，少用专业术语；不编造内容

工作日志记录如下：
')
) AS v(username, type, name, content)
WHERE NOT EXISTS (
  SELECT 1 FROM user_prompts up
  JOIN users u ON u.id = up.user_id
  WHERE u.username = v.username AND up.name = v.name
);

-- ============================================================
-- 系统默认提示词 + 系统配置（管理员可在"系统设置"中修改）
-- ============================================================

INSERT INTO system_prompts (type, name, content)
SELECT v.type, v.name, v.content
FROM (VALUES
  ('log_optimize', '系统默认-日志优化',
'你是一位资深的项目管理助手，擅长将零散的工作记录整理成专业、易读的工作日志。

请将用户提供的工作日志内容进行优化，要求：
1. 结构清晰：按"今日完成工作"、"遇到的问题及解决方案"、"明日计划"等维度组织（可根据实际内容调整）
2. 突出成果和工作量：量化描述（如完成数量、进度百分比、耗时等）
3. 语言专业简洁，使用业务化表达
4. 保留原始信息，不编造内容
5. 直接输出优化后的日志内容，不要任何额外解释

工作日志内容如下：'),
  ('report', '系统默认-报告生成',
'你是一位专业的项目管理助手，请根据下方的工作日志记录，生成一份结构清晰的{REPORT_TYPE}。

要求：
1. 使用 Markdown 格式输出
2. 包含以下部分：概述（总体进展与成果总结）、主要工作内容（按人或按主题分组，条理清晰）、关键成果与亮点（量化数据）、问题与风险、下周/下月计划建议
3. 突出工作量与成果，用数据说话
4. 语言专业、简洁、易读
5. 不要编造日志中不存在的内容

工作日志记录如下：
'),
  ('chat', '系统默认-AI对话',
'你是"日志管理助手"，一位专业的项目管理 AI 助手。你可以帮助用户：
1. 查询和分析工作日志数据（基于下方提供的日志上下文）
2. 总结工作进展、提炼成果
3. 起草周报/月报片段
4. 提供工作改进建议

注意：你只能基于"日志数据上下文"中提供的信息回答与日志相关的问题，不得编造数据。如果上下文中没有相关信息，请如实告知。上下文范围之外的数据你无权访问。')
) AS v(type, name, content)
WHERE NOT EXISTS (SELECT 1 FROM system_prompts WHERE system_prompts.type = v.type);

INSERT INTO system_config (config_key, config_value, description)
SELECT v.key, v.value, v.descr
FROM (VALUES
  -- 系统 AI 配置（留空则回退到服务器 .env 环境变量）
  -- 菜单可见性由 role_menus 配置控制（系统设置-角色菜单可见性），无需种子
  ('qwen_api_key',     '', '通义千问 API Key'),
  ('qwen_base_url',    'https://dashscope.aliyuncs.com/compatible-mode/v1', '通义千问 Base URL'),
  ('qwen_model',       'qwen-plus', '通义千问模型'),
  ('deepseek_api_key', '', 'DeepSeek API Key'),
  ('deepseek_base_url','https://api.deepseek.com/v1', 'DeepSeek Base URL'),
  ('deepseek_model',   'deepseek-chat', 'DeepSeek模型')
) AS v(key, value, descr)
WHERE NOT EXISTS (SELECT 1 FROM system_config WHERE system_config.config_key = v.key);
