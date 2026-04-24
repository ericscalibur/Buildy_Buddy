import type { Command } from 'commander';
import { validate } from 'node-cron';
import {
  loadCronJobs,
  saveCronJobs,
  isGatewayRunning,
} from '../../config/loader.js';
import { addCronJob, removeCronJob } from '../../cron/manager.js';
import { API_PORT } from '../../api/server.js';
import type { CronJob, CronRun } from '../../config/types.js';

export function registerCronCommand(program: Command) {
  const cron = program.command('cron').description('Manage cron jobs');

  cron
    .command('add')
    .description('Add a cron job')
    .requiredOption('--name <name>', 'Job name')
    .requiredOption('--cron <expr>', 'Cron expression (e.g. "0 20 * * *")')
    .option('--tz <tz>', 'Timezone (IANA)', 'America/New_York')
    .option('--session <type>', 'Session type: isolated | persistent', 'isolated')
    .requiredOption('--message <msg>', 'Prompt sent to the agent')
    .option('--announce', 'Post result back to the channel', false)
    .requiredOption('--channel <ch>', 'Channel (e.g. whatsapp)')
    .requiredOption('--to <target>', 'Target (e.g. group:JID)')
    .option('--agent <id>', 'Agent ID (default: digest)')
    .action(async (opts) => {
      if (!validate(opts.cron)) {
        console.error('Invalid cron expression:', opts.cron);
        process.exit(1);
      }
      const job: CronJob = {
        name: opts.name,
        cron: opts.cron,
        tz: opts.tz,
        session: opts.session,
        message: opts.message,
        announce: opts.announce,
        channel: opts.channel,
        to: opts.to,
        agentId: opts.agent ?? 'digest',
        createdAt: new Date().toISOString(),
      };
      await addCronJob(job);
      console.log(`Added cron job: ${job.name}`);
      console.log(`  Schedule: ${job.cron} (${job.tz})`);
      console.log(`  Target:   ${job.to}`);
      console.log(`  Announce: ${job.announce}`);
    });

  cron
    .command('list')
    .description('List all cron jobs')
    .action(async () => {
      const jobs = await loadCronJobs();
      if (!jobs.length) { console.log('No cron jobs configured.'); return; }
      console.log('\nCron Jobs:\n');
      for (const j of jobs) {
        console.log(`  ${j.name}`);
        console.log(`    Schedule: ${j.cron} (${j.tz})`);
        console.log(`    Target:   ${j.to}`);
        console.log(`    Announce: ${j.announce}`);
        console.log(`    Agent:    ${j.agentId ?? 'digest'}`);
        console.log();
      }
    });

  cron
    .command('run <name>')
    .description('Trigger a cron job immediately')
    .action(async (name: string) => {
      const pid = await isGatewayRunning();
      if (!pid) {
        console.error('Gateway is not running. Start it with: openclaw start');
        process.exit(1);
      }
      console.log(`Triggering cron job: ${name}...`);
      const res = await fetch(`http://127.0.0.1:${API_PORT}/cron/run/${encodeURIComponent(name)}`, {
        method: 'POST',
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) {
        console.error('Error:', data.error);
        process.exit(1);
      }
      console.log('\nResult:\n');
      console.log(data.result);
    });

  cron
    .command('runs')
    .description('Show run history for a cron job')
    .requiredOption('--id <name>', 'Job name')
    .action(async (opts) => {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/cron/runs/${encodeURIComponent(opts.id)}`);
      const data = (await res.json()) as { runs?: CronRun[]; error?: string };
      const runs = data.runs ?? [];
      if (!runs.length) { console.log('No runs found for:', opts.id); return; }
      console.log(`\nRun history for: ${opts.id}\n`);
      for (const r of runs.slice(-10).reverse()) {
        const duration = r.finishedAt
          ? `${Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s`
          : 'running';
        const mark = r.status === 'success' ? '✓' : r.status === 'error' ? '✗' : '…';
        console.log(`  ${mark} ${r.startedAt.slice(0, 19)}  [${duration}]  ${r.status}`);
        if (r.error) console.log(`    Error: ${r.error}`);
      }
      console.log();
    });

  cron
    .command('remove <name>')
    .description('Remove a cron job')
    .action(async (name: string) => {
      await removeCronJob(name);
      console.log(`Removed cron job: ${name}`);
    });
}
