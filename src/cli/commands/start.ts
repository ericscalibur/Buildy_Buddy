import type { Command } from 'commander';
import { startGateway } from '../../gateway.js';

export function registerStartCommand(program: Command) {
  program
    .command('start')
    .description('Start the OpenClaw gateway (foreground)')
    .action(async () => {
      await startGateway();
    });
}
