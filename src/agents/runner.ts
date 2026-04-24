import {
  loadAgentSystemPrompt,
  loadMessageBuffer,
  clearMessageBuffer,
} from '../config/loader.js';
import type { OpenClawConfig, CronJob } from '../config/types.js';

export async function runDigestAgent(job: CronJob, config: OpenClawConfig): Promise<string> {
  const agentId = job.agentId ?? 'digest';
  const agentConfig = config.agents.list.find((a) => a.id === agentId);
  if (!agentConfig) throw new Error(`Agent '${agentId}' not found in config`);

  const systemPrompt = await loadAgentSystemPrompt(agentConfig.workspace);
  const groupJid = job.to.replace(/^group:/, '');
  const messages = await loadMessageBuffer(groupJid);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMessages = messages.filter((m) => m.timestamp >= todayStart.getTime());

  let contextBlock = '\n\n## Group Messages (Today)\n\n';
  if (todayMessages.length > 0) {
    contextBlock += todayMessages
      .map((m) => {
        const time = new Date(m.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const name = m.pushName ?? m.from.split('@')[0];
        return `[${time}] ${name}: ${m.body}`;
      })
      .join('\n');
  } else {
    contextBlock += 'No messages today.';
  }

  const userMessage = job.message + contextBlock;
  const text = await callLLM(config, systemPrompt, userMessage);

  if (job.session === 'isolated') {
    await clearMessageBuffer(groupJid);
  }

  return text;
}

async function callLLM(
  config: OpenClawConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  if (config.provider === 'ollama') {
    return callOllama(config.model, systemPrompt, userMessage);
  }
  if (config.provider === 'anthropic') {
    return callAnthropic(config.model, systemPrompt, userMessage);
  }
  if (config.provider === 'openai') {
    return callOpenAI(config.model, systemPrompt, userMessage);
  }
  throw new Error(`Unknown provider: ${config.provider}`);
}

async function callOllama(model: string, system: string, user: string): Promise<string> {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
}

async function callAnthropic(model: string, system: string, user: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client as any).messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text as string)
    .join('');
}

async function callOpenAI(model: string, system: string, user: string): Promise<string> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return response.choices[0]?.message?.content ?? '';
}
