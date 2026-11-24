import { promptApi } from '../api';

/**
 * 内置默认标准日志模板：提示词配置页未维护 log_template、接口失败或内容为空时兜底展示
 */
export const DEFAULT_LOG_TEMPLATE = `# 2026-11-07 张三 的日志
## 项目名称：{项目名称}
- 投入时长：X小时
### 小组名称：{小组名称}
- 需求工作：{具体对象 + 具体动作 + 成果/数据}
- 设计工作：{具体对象 + 具体动作 + 成果/数据}
- 开发测试工作：{具体对象 + 具体动作 + 成果/数据}
- 用户验证工作：{具体对象 + 具体动作 + 成果/数据}
- 数据接入和治理工作：{具体对象 + 具体动作 + 成果/数据}
- 智慧化工配套改造：{具体对象 + 具体动作 + 成果/数据}
- 其他工作：{具体对象 + 具体动作 + 成果/数据}
（每类工作无相关内容写"不涉及"；有多条时本行写"{类别}："，下一行起逐条编号；同一天涉及多个小组时，必须重复"### 小组名称：{小组名称}"段，每个三级标题下只能有1个小组名称；无小组信息则不写三级标题，直接按七类固定顺序列出事项）
## 明日计划
- {后续工作安排}
## 问题与风险
- {卡点或需要的协助，如实写"无"也可以}`;

/**
 * 读取系统管理员在「提示词配置 - 标准日志示例」中维护的模板。
 * 任一异常（请求失败、无记录、内容为空）均回退内置默认模板，保证填报页气泡始终可展示。
 */
export async function loadLogTemplate(): Promise<string> {
  try {
    const res = await promptApi.list('log_template');
    const content = res.data?.systemPrompts?.[0]?.content?.trim();
    return content || DEFAULT_LOG_TEMPLATE;
  } catch {
    return DEFAULT_LOG_TEMPLATE;
  }
}
