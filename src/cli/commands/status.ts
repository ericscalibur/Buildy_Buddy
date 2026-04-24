import type { Command } from 'commander';
import { isGatewayRunning } from '../../config/loader.js';
import { API_PORT } from '../../api/server.js';

export function registerStatusCommand(program: Command) {
  program
    .command('status')
    .description('Show gateway and channel status')
    .action(async () => {
      const pid = await isGatewayRunning();
      if (!pid) {
        console.log('Gateway: stopped');
        console.log('Run "openclaw start" to start the gateway.');
        return;
      }
      console.log(`Gateway: running (pid ${pid})`);
      try {
        const res = await fetch(`http://127.0.0.1:${API_PORT}/status`);
        const data = (await res.json()) as { gateway: string; whatsapp: string };
        console.log(`WhatsApp: ${data.whatsapp}`);
      } catch {
        console.log('WhatsApp: (gateway unreachable)');
      }
    });
}
