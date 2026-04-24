import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { join } from 'path';
import { CREDENTIALS_DIR, appendToBuffer, loadConfig } from '../../config/loader.js';
import type { BufferedMessage } from '../../config/types.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr';

const AUTH_DIR = join(CREDENTIALS_DIR, 'whatsapp');

const silentLogger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as import('pino').Logger;

let sock: WASocket | null = null;
let status: ConnectionStatus = 'disconnected';
let qrCode: string | null = null;

export const getConnectionStatus = (): ConnectionStatus => status;
export const getQrCode = (): string | null => qrCode;
export const getSocket = (): WASocket | null => sock;

export async function connect(onQR?: (qr: string) => void): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  status = 'connecting';

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    printQRInTerminal: false,
    logger: silentLogger,
    browser: ['OpenClaw', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      status = 'qr';
      onQR?.(qr);
    }

    if (connection === 'close') {
      status = 'disconnected';
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        setTimeout(() => connect(onQR), 5000);
      }
    } else if (connection === 'open') {
      status = 'connected';
      qrCode = null;
      console.log('[whatsapp] connected');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const config = await loadConfig();
    const waConfig = config.channels?.whatsapp;
    if (!waConfig) return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid?.endsWith('@g.us')) continue;

      if (waConfig.groupPolicy === 'allowlist' && !waConfig.groupAllowFrom?.includes(jid)) continue;

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';
      if (!body) continue;

      const buffered: BufferedMessage = {
        from: msg.key.participant || jid,
        pushName: msg.pushName ?? undefined,
        body,
        timestamp: (msg.messageTimestamp as number) * 1000,
      };

      await appendToBuffer(jid, buffered, waConfig.historyBuffer ?? 200);
    }
  });
}

export async function listGroups(): Promise<Array<{ id: string; subject: string; participants: number }>> {
  if (!sock || status !== 'connected') throw new Error('WhatsApp not connected');
  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({
    id: g.id,
    subject: g.subject,
    participants: g.participants.length,
  }));
}

export async function sendTextMessage(jid: string, text: string): Promise<void> {
  if (!sock || status !== 'connected') throw new Error('WhatsApp not connected');
  await sock.sendMessage(jid, { text });
}

export async function disconnect(): Promise<void> {
  if (sock) {
    await sock.logout();
    sock = null;
    status = 'disconnected';
  }
}
