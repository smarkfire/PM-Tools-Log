/**
 * AI 服务 - 支持通义千问（DashScope）与 DeepSeek，均使用 OpenAI 兼容接口
 * Key 优先级：用户自己的 Key > 系统配置（数据库）> .env 环境变量
 */
import { env } from '../config/env';

export type AiProvider = 'qwen' | 'deepseek';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 提供商连接配置（由调用方通过 config.service 解析后传入） */
export interface ProviderOverride {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function getEnvConfig(provider: AiProvider): ProviderOverride {
  if (provider === 'qwen') {
    return { apiKey: env.ai.qwen.apiKey, baseUrl: env.ai.qwen.baseUrl, model: env.ai.qwen.model };
  }
  return { apiKey: env.ai.deepseek.apiKey, baseUrl: env.ai.deepseek.baseUrl, model: env.ai.deepseek.model };
}

/**
 * 调用 AI 对话接口（OpenAI 兼容格式）
 * @param override 数据库解析出的配置（用户/系统级）；未传时回退到 .env
 */
export async function chat(
  provider: AiProvider,
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    override?: ProviderOverride;
  }
): Promise<string> {
  const cfg = options?.override ?? getEnvConfig(provider);
  if (!cfg.apiKey) {
    throw new Error(
      `${provider === 'qwen' ? '通义千问' : 'DeepSeek'} 未配置 API Key：请在"个人设置-AI 配置"填写自己的 Key，或联系管理员在系统设置中配置`
    );
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: options?.temperature ?? 0.7,
  };
  if (options?.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2分钟超时

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI 接口调用失败(${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI 返回内容为空');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
