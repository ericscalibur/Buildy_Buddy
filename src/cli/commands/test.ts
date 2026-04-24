import type { Command } from 'commander';
import { loadConfig, loadAgentSystemPrompt, OPENCLAW_DIR } from '../../config/loader.js';
import { join } from 'path';

const FAKE_MESSAGES = [
  '[09:02 AM] Sarah: Morning everyone! Did anyone watch the game last night?',
  '[09:05 AM] Mike: Yes! What a finish, incredible last minute goal',
  '[09:07 AM] Sarah: Also heads up - team lunch moved to Thursday this week at 12:30',
  '[09:08 AM] Jake: Thanks! What time?',
  '[09:10 AM] Sarah: 12:30 at the usual spot',
  '[09:15 AM] Mike: Also sharing this article everyone was asking about https://example.com/article',
  '[09:18 AM] Jake: Nice. Anyone looked at the Q2 planning doc yet?',
  '[09:20 AM] Mike: Skimmed it. Looks like we are targeting a June release',
  '[09:22 AM] Sarah: Confirmed, June 15th. More details in the all-hands Friday',
  '[10:45 AM] Jake: Reminder: standup in 15 mins',
  '[02:30 PM] Jake: Anyone free for a quick sync at 3:30?',
  '[02:32 PM] Sarah: Can do',
  '[02:33 PM] Mike: Sending invite',
].join('\n');

export function registerTestCommand(program: Command) {
  program
    .command('test-digest')
    .description('Test the digest agent with a fake conversation (no WhatsApp needed)')
    .option('--model <model>', 'Override the model for this test')
    .action(async (opts) => {
      const config = await loadConfig();
      if (opts.model) config.model = opts.model;

      const systemPrompt = await loadAgentSystemPrompt(join(OPENCLAW_DIR, 'workspace-digest'));

      const userMessage =
        "It is now time for the daily digest. Review all group messages from today and produce the daily summary following your Digest Format instructions. Include today's date." +
        '\n\n## Group Messages (Today)\n\n' +
        FAKE_MESSAGES;

      console.log(`Model: ${config.model}`);
      console.log('Calling Ollama...\n');

      const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (!res.ok) {
        console.error(`Ollama error: ${res.status} ${await res.text()}`);
        process.exit(1);
      }

      const data = (await res.json()) as { message: { content: string } };
      console.log('--- Digest Output ---\n');
      console.log(data.message.content);
      console.log('\n--- End ---');
    });
}
