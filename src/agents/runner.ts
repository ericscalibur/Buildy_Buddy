import Anthropic from '@anthropic-ai/sdk';
import {
  loadAgentSystemPrompt,
  loadMessageBuffer,
  clearMessageBuffer,
} from '../config/loader.js';
import type { OpenClawConfig, CronJob } from '../config/types.js';

const client = new Anthropic();

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

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: job.message + contextBlock }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (job.session === 'isolated') {
    await clearMessageBuffer(groupJid);
  }

  return text;
}
