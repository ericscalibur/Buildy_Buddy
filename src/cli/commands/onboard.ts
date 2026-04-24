import { access, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  initDirectories,
  loadConfig,
  saveConfig,
  CONFIG_FILE,
  OPENCLAW_DIR,
} from '../../config/loader.js';

const DIGEST_AGENTS_MD = `# Digest Bot

You are a group chat digest bot. Your job is to summarize conversations, not participate in them.

## Standing Orders

### Program: Daily Digest
- **Scope**: Summarize the day's group messages into a concise, readable digest.
- **Triggers**: Cron job only. Never respond to individual messages.
- **Format**: See Digest Format below.
- **Escalation**: If fewer than 5 messages were sent, post a brief "Quiet day" note instead of a full summary.

### What NOT to Do
- NEVER respond to individual messages in the group.
- NEVER engage in conversation, banter, or react to messages.
- NEVER reply to questions, even if directly asked (unless from the admin via DM).
- NEVER share opinions, commentary, or editorializing beyond neutral summarization.
- For every regular group message, return the silent token: \`NO_REPLY\`

### Admin DM Access
- The admin (see config) may DM you directly for status checks or to adjust behavior.
- Only respond to DMs from the admin. All other DMs: \`NO_REPLY\`

## Digest Format

When triggered by the cron job, produce a summary in this structure:

\`\`\`
📋 *Daily Digest — {date}*

📌 *Key Topics*
• [Topic 1]: Brief summary of the discussion
• [Topic 2]: Brief summary of the discussion

📅 *Events & Plans*
• [Any upcoming events, meetups, or plans mentioned]

🔗 *Links & Resources*
• [Any links shared, with brief context]

💬 *Highlights*
• [Notable messages, announcements, or funny moments — keep it brief]

📊 {X} messages from {Y} members today.
\`\`\`

If it was a quiet day (fewer than 5 messages):

\`\`\`
📋 *Daily Digest — {date}*

Quiet day — only {X} messages. Nothing major to report. ✌️
\`\`\`

### Summarization Guidelines
- Be concise. Each bullet should be 1-2 sentences max.
- Group related messages into topics rather than listing every message.
- Attribute key points to the person who said them when relevant.
- Capture the *substance*, not the small talk.
- If there's a heated discussion, summarize both sides neutrally.
- Preserve any action items or decisions that were made.
`;

export async function runOnboard(options: { installDaemon?: boolean }) {
  console.log('Setting up OpenClaw...');
  await initDirectories();

  try {
    await access(CONFIG_FILE);
    console.log('Config already exists:', CONFIG_FILE);
  } catch {
    await saveConfig(await loadConfig());
    console.log('Created config:', CONFIG_FILE);
  }

  const agentsMd = join(OPENCLAW_DIR, 'workspace-digest', 'AGENTS.md');
  try {
    await access(agentsMd);
    console.log('Digest workspace already exists:', agentsMd);
  } catch {
    await writeFile(agentsMd, DIGEST_AGENTS_MD, 'utf-8');
    console.log('Created digest workspace:', agentsMd);
  }

  if (options.installDaemon) installLaunchdDaemon();

  console.log('\nSetup complete!');
  console.log('Next steps:');
  console.log('  1. Set ANTHROPIC_API_KEY in your environment');
  console.log('  2. openclaw channels login whatsapp');
  console.log('  3. openclaw channels groups whatsapp');
  console.log('  4. Edit ~/.openclaw/openclaw.json with your group JID');
  console.log('  5. openclaw cron add --name daily-digest --cron "0 20 * * *" --tz America/New_York \\');
  console.log('       --message "Time for the daily digest..." --announce --channel whatsapp --to "group:YOUR_JID"');
  console.log('  6. openclaw start');
}

function installLaunchdDaemon() {
  const home = process.env.HOME!;
  const plistPath = join(home, 'Library/LaunchAgents/com.openclaw.gateway.plist');
  const nodeBin = process.execPath;
  const scriptPath = fileURLToPath(new URL('../../../dist/index.js', import.meta.url));
  const logOut = join(home, '.openclaw/logs/gateway.log');
  const logErr = join(home, '.openclaw/logs/gateway-error.log');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${scriptPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logOut}</string>
  <key>StandardErrorPath</key>
  <string>${logErr}</string>
</dict>
</plist>`;

  require('fs').writeFileSync(plistPath, plist);
  execSync(`launchctl load "${plistPath}"`);
  console.log('Installed launchd daemon:', plistPath);
}
