import type { Command } from 'commander';
import { access } from 'fs/promises';
import {
  CONFIG_FILE,
  OPENCLAW_DIR,
  CREDENTIALS_DIR,
  isGatewayRunning,
} from '../../config/loader.js';
import { join } from 'path';
import { API_PORT } from '../../api/server.js';

function ok(label: string, detail = '') {
  console.log(`  ✓ ${label}${detail ? '  ' + detail : ''}`);
}
function fail(label: string, fix = '') {
  console.log(`  ✗ ${label}${fix ? '\n      Fix: ' + fix : ''}`);
}

export function registerDoctorCommand(program: Command) {
  program
    .command('doctor')
    .description('Check OpenClaw setup health')
    .action(async () => {
      console.log('\nOpenClaw Doctor\n');

      // Config dir
      try {
        await access(OPENCLAW_DIR);
        ok('Config directory exists', OPENCLAW_DIR);
      } catch {
        fail('Config directory missing', 'Run: openclaw onboard');
      }

      // Config file
      try {
        await access(CONFIG_FILE);
        ok('openclaw.json found');
      } catch {
        fail('openclaw.json missing', 'Run: openclaw onboard');
      }

      // WhatsApp credentials
      try {
        await access(join(CREDENTIALS_DIR, 'whatsapp', 'creds.json'));
        ok('WhatsApp credentials found');
      } catch {
        fail('WhatsApp not paired', 'Run: openclaw channels login whatsapp');
      }

      // Anthropic API key
      if (process.env.ANTHROPIC_API_KEY) {
        ok('ANTHROPIC_API_KEY set');
      } else {
        fail('ANTHROPIC_API_KEY not set', 'export ANTHROPIC_API_KEY=sk-ant-...');
      }

      // Gateway
      const pid = await isGatewayRunning();
      if (pid) {
        ok(`Gateway running`, `pid ${pid}`);
        try {
          const res = await fetch(`http://127.0.0.1:${API_PORT}/status`);
          const data = (await res.json()) as { whatsapp: string };
          data.whatsapp === 'connected'
            ? ok('WhatsApp connected')
            : fail(`WhatsApp status: ${data.whatsapp}`, 'Run: openclaw channels login whatsapp');
        } catch {
          fail('API server unreachable');
        }
      } else {
        fail('Gateway not running', 'Run: openclaw start');
      }

      console.log();
    });
}
