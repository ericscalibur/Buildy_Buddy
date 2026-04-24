import {
  loadAgentSystemPrompt,
  loadMessageBuffer,
  clearMessageBuffer,
  OPENCLAW_DIR,
} from '../config/loader.js';
import { join } from 'path';
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

  const text = await callOllama(config.model, systemPrompt, job.message + contextBlock);

  if (job.session === 'isolated') {
    await clearMessageBuffer(groupJid);
  }

  return text;
}

export async function runDmAgent(userMessage: string, config: OpenClawConfig): Promise<string> {
  const systemPrompt = await loadAgentSystemPrompt(join(OPENCLAW_DIR, 'workspace-digest'));
  return callOllama(config.model, systemPrompt, userMessage);
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
