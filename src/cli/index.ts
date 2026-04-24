#!/usr/bin/env node
import { Command } from 'commander';
import { runOnboard } from './commands/onboard.js';
import { registerChannelsCommand } from './commands/channels.js';
import { registerCronCommand } from './commands/cron.js';
import { registerStatusCommand } from './commands/status.js';
import { registerStartCommand } from './commands/start.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerTestCommand } from './commands/test.js';

const program = new Command();

program
  .name('buildy')
  .description('WhatsApp group digest bot gateway')
  .version('0.1.0');

program
  .command('onboard')
  .description('First-time setup')
  .option('--install-daemon', 'Install macOS launchd daemon')
  .action((opts) => runOnboard({ installDaemon: opts.installDaemon }));

registerChannelsCommand(program);
registerCronCommand(program);
registerStatusCommand(program);
registerStartCommand(program);

// alias: openclaw gateway start
const gateway = program.command('gateway').description('Gateway commands');
gateway.command('start').description('Start the OpenClaw gateway').action(async () => {
  const { startGateway } = await import('../gateway.js');
  await startGateway();
});
registerDoctorCommand(program);
registerTestCommand(program);

program.parse();
