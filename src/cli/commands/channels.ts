import type { Command } from 'commander';
import qrcode from 'qrcode-terminal';
import { connect, listGroups, getConnectionStatus } from '../../channels/whatsapp/index.js';
import { isGatewayRunning } from '../../config/loader.js';
import { API_PORT } from '../../api/server.js';

export function registerChannelsCommand(program: Command) {
  const channels = program.command('channels').description('Manage communication channels');

  channels
    .command('login <channel>')
    .description('Pair a channel (e.g. whatsapp)')
    .action(async (channel: string) => {
      if (channel !== 'whatsapp') {
        console.error(`Unknown channel: ${channel}`);
        process.exit(1);
      }
      await loginWhatsApp();
    });

  channels
    .command('status <channel>')
    .description('Show channel connection status')
    .action(async (channel: string) => {
      if (channel !== 'whatsapp') {
        console.error(`Unknown channel: ${channel}`);
        process.exit(1);
      }
      const pid = await isGatewayRunning();
      if (!pid) {
        console.log('Gateway is not running. Start it with: openclaw start');
        process.exit(0);
      }
      const res = await fetch(`http://127.0.0.1:${API_PORT}/channels/whatsapp/status`);
      const data = (await res.json()) as { status: string };
      console.log('WhatsApp status:', data.status);
    });

  channels
    .command('groups <channel>')
    .description('List groups for a channel')
    .action(async (channel: string) => {
      if (channel !== 'whatsapp') {
        console.error(`Unknown channel: ${channel}`);
        process.exit(1);
      }
      const pid = await isGatewayRunning();
      if (!pid) {
        console.log('Gateway is not running. Start it with: openclaw start');
        process.exit(0);
      }
      const res = await fetch(`http://127.0.0.1:${API_PORT}/channels/whatsapp/groups`);
      const data = (await res.json()) as { groups: Array<{ id: string; subject: string; participants: number }> };
      if (!data.groups.length) {
        console.log('No groups found.');
        return;
      }
      console.log('\nWhatsApp Groups:\n');
      for (const g of data.groups) {
        console.log(`  ${g.subject}`);
        console.log(`  JID: ${g.id}  (${g.participants} participants)`);
        console.log();
      }
    });
}

async function loginWhatsApp() {
  console.log('Starting WhatsApp pairing...\n');

  await connect((qr) => {
    console.clear();
    console.log('Scan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nWhatsApp → Settings → Linked Devices → Link a Device\n');
  });

  await waitForStatus();
}

function waitForStatus(): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = setInterval(() => {
      const s = getConnectionStatus();
      if (s === 'connected') {
        clearInterval(check);
        console.log('\nWhatsApp paired successfully!');
        console.log('You can now run: openclaw channels groups whatsapp');
        resolve();
        setTimeout(() => process.exit(0), 500);
      }
      if (Date.now() - start > 120_000) {
        clearInterval(check);
        reject(new Error('Timed out waiting for WhatsApp connection'));
      }
    }, 500);
  });
}
