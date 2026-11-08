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
  // 超时可配置（Serverless 平台如 Vercel 需小于函数 maxDuration）
  const timeout = setTimeout(() => controller.abort(), env.ai.timeoutMs);

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

/**
 * 调用 AI 对话接口（流式）：逐段产出结构化增量（OpenAI 兼容 SSE）
 * - type 'reasoning'：模型思考过程增量（delta.reasoning_content，模型支持时才有）
 * - type 'content'：正文内容增量
 */
export async function* chatStream(
  provider: AiProvider,
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    override?: ProviderOverride;
  }
): AsyncGenerator<{ type: 'reasoning' | 'content'; text: string }> {
  const cfg = options?.override ?? getEnvConfig(provider);
  if (!cfg.apiKey) {
    throw new Error(
      `${provider === 'qwen' ? '通义千问' : 'DeepSeek'} 未配置 API Key：请在"个人设置-AI 配置"填写自己的 Key，或联系管理员在系统设置中配置`
    );
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream: true,
    temperature: options?.temperature ?? 0.7,
  };
  if (options?.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ai.timeoutMs);

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
    if (!res.body) {
      throw new Error('AI 未返回流式内容');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj.choices?.[0]?.delta;
          const reasoning = delta?.reasoning_content;
          const content = delta?.content;
          if (reasoning) yield { type: 'reasoning', text: reasoning as string };
          if (content) yield { type: 'content', text: content as string };
        } catch {
          // 忽略不完整分片
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
