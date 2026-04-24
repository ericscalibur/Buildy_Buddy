export interface AgentConfig {
  id: string;
  workspace: string;
}

export interface AgentsConfig {
  default: string;
  list: AgentConfig[];
  defaults?: { sandbox?: { mode: string } };
}

export interface BindingConfig {
  match: {
    channel: string;
    peer: { kind: 'group' | 'dm'; id: string };
  };
  agentId: string;
}

export interface WhatsAppGroupConfig {
  requireMention: boolean;
}

export interface WhatsAppChannelConfig {
  dmPolicy?: 'allowlist' | 'all' | 'none';
  allowFrom?: string[];
  groupPolicy?: 'allowlist' | 'all' | 'none';
  groupAllowFrom?: string[];
  groups?: Record<string, WhatsAppGroupConfig>;
  historyBuffer?: number;
}

export interface OpenClawConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  agents: AgentsConfig;
  bindings?: BindingConfig[];
  channels?: { whatsapp?: WhatsAppChannelConfig };
  cron?: {
    enabled: boolean;
    maxConcurrentRuns: number;
    retry?: {
      maxAttempts: number;
      backoffMs: number[];
      retryOn: string[];
    };
  };
}

export interface CronJob {
  name: string;
  cron: string;
  tz: string;
  session: 'isolated' | 'persistent';
  message: string;
  announce: boolean;
  channel: string;
  to: string;
  agentId?: string;
  createdAt: string;
}

export interface CronRun {
  cronName: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'error';
  error?: string;
}

export interface BufferedMessage {
  from: string;
  pushName?: string;
  body: string;
  timestamp: number;
}
