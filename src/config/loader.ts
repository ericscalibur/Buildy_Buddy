import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { OpenClawConfig, CronJob, BufferedMessage } from './types.js';

export const OPENCLAW_DIR = join(homedir(), '.openclaw');
export const CONFIG_FILE = join(OPENCLAW_DIR, 'openclaw.json');
export const CRONS_FILE = join(OPENCLAW_DIR, 'crons.json');
export const BUFFERS_DIR = join(OPENCLAW_DIR, 'buffers');
export const CREDENTIALS_DIR = join(OPENCLAW_DIR, 'credentials');
export const LOGS_DIR = join(OPENCLAW_DIR, 'logs');
export const PID_FILE = join(OPENCLAW_DIR, 'gateway.pid');
export const RUN_HISTORY_DIR = join(OPENCLAW_DIR, 'run-history');

export const DEFAULT_CONFIG: OpenClawConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  agents: {
    default: 'main',
    list: [
      { id: 'main', workspace: join(OPENCLAW_DIR, 'workspace') },
      { id: 'digest', workspace: join(OPENCLAW_DIR, 'workspace-digest') },
    ],
  },
  bindings: [],
  channels: {
    whatsapp: {
      dmPolicy: 'allowlist',
      allowFrom: [],
      groupPolicy: 'allowlist',
      groupAllowFrom: [],
      groups: {},
      historyBuffer: 200,
    },
  },
  cron: {
    enabled: true,
    maxConcurrentRuns: 1,
    retry: {
      maxAttempts: 3,
      backoffMs: [60000, 120000, 300000],
      retryOn: ['rate_limit', 'overloaded', 'network', 'server_error'],
    },
  },
};

export async function initDirectories() {
  for (const dir of [
    OPENCLAW_DIR,
    join(OPENCLAW_DIR, 'workspace'),
    join(OPENCLAW_DIR, 'workspace-digest'),
    BUFFERS_DIR,
    join(CREDENTIALS_DIR, 'whatsapp'),
    LOGS_DIR,
    RUN_HISTORY_DIR,
  ]) {
    await mkdir(dir, { recursive: true });
  }
}

export async function loadConfig(): Promise<OpenClawConfig> {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf-8')) as OpenClawConfig;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export async function saveConfig(config: OpenClawConfig) {
  await mkdir(OPENCLAW_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function loadCronJobs(): Promise<CronJob[]> {
  try {
    return JSON.parse(await readFile(CRONS_FILE, 'utf-8')) as CronJob[];
  } catch {
    return [];
  }
}

export async function saveCronJobs(jobs: CronJob[]) {
  await writeFile(CRONS_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

export async function loadAgentSystemPrompt(workspacePath: string): Promise<string> {
  try {
    return await readFile(join(workspacePath, 'AGENTS.md'), 'utf-8');
  } catch {
    return 'You are a helpful assistant.';
  }
}

function sanitizeJid(jid: string): string {
  return jid.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function loadMessageBuffer(groupJid: string): Promise<BufferedMessage[]> {
  try {
    return JSON.parse(
      await readFile(join(BUFFERS_DIR, `${sanitizeJid(groupJid)}.json`), 'utf-8')
    ) as BufferedMessage[];
  } catch {
    return [];
  }
}

export async function saveMessageBuffer(groupJid: string, messages: BufferedMessage[]) {
  await mkdir(BUFFERS_DIR, { recursive: true });
  await writeFile(
    join(BUFFERS_DIR, `${sanitizeJid(groupJid)}.json`),
    JSON.stringify(messages, null, 2),
    'utf-8'
  );
}

export async function appendToBuffer(groupJid: string, msg: BufferedMessage, maxSize: number) {
  let buf = await loadMessageBuffer(groupJid);
  buf.push(msg);
  if (buf.length > maxSize) buf = buf.slice(buf.length - maxSize);
  await saveMessageBuffer(groupJid, buf);
}

export async function clearMessageBuffer(groupJid: string) {
  await saveMessageBuffer(groupJid, []);
}

export async function isGatewayRunning(): Promise<number | null> {
  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}
