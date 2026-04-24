import { schedule, type ScheduledTask } from 'node-cron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import {
  loadCronJobs,
  saveCronJobs,
  loadConfig,
  RUN_HISTORY_DIR,
} from '../config/loader.js';
import { runDigestAgent } from '../agents/runner.js';
import { sendTextMessage } from '../channels/whatsapp/index.js';
import type { CronJob, CronRun } from '../config/types.js';

const activeTasks = new Map<string, ScheduledTask>();
let runningJobs = 0;

export async function addCronJob(job: CronJob): Promise<void> {
  const jobs = await loadCronJobs();
  const idx = jobs.findIndex((j) => j.name === job.name);
  if (idx >= 0) jobs[idx] = job;
  else jobs.push(job);
  await saveCronJobs(jobs);
}

export async function removeCronJob(name: string): Promise<void> {
  const jobs = await loadCronJobs();
  await saveCronJobs(jobs.filter((j) => j.name !== name));
  const task = activeTasks.get(name);
  if (task) { task.stop(); activeTasks.delete(name); }
}

export async function getCronJob(name: string): Promise<CronJob | undefined> {
  const jobs = await loadCronJobs();
  return jobs.find((j) => j.name === name);
}

export async function startScheduler(): Promise<void> {
  const jobs = await loadCronJobs();
  for (const job of jobs) scheduleJob(job);
  console.log(`[cron] scheduler started with ${jobs.length} job(s)`);
}

function scheduleJob(job: CronJob) {
  activeTasks.get(job.name)?.stop();
  const task = schedule(job.cron, () => executeJob(job).catch(console.error), {
    timezone: job.tz,
  });
  activeTasks.set(job.name, task);
}

export async function executeJob(job: CronJob): Promise<string> {
  const config = await loadConfig();
  const maxConcurrent = config.cron?.maxConcurrentRuns ?? 1;
  if (runningJobs >= maxConcurrent) throw new Error(`Max concurrent runs (${maxConcurrent}) reached`);

  runningJobs++;
  const run: CronRun = { cronName: job.name, startedAt: new Date().toISOString(), status: 'running' };

  try {
    await saveRunRecord(run);
    const result = await runDigestAgent(job, config);

    if (job.announce && result.trim() !== 'NO_REPLY') {
      await sendTextMessage(job.to.replace(/^group:/, ''), result);
    }

    run.finishedAt = new Date().toISOString();
    run.status = 'success';
    await saveRunRecord(run);
    return result;
  } catch (err) {
    run.finishedAt = new Date().toISOString();
    run.status = 'error';
    run.error = String(err);
    await saveRunRecord(run);
    throw err;
  } finally {
    runningJobs--;
  }
}

async function saveRunRecord(run: CronRun) {
  await mkdir(RUN_HISTORY_DIR, { recursive: true });
  const file = join(RUN_HISTORY_DIR, `${run.cronName}.json`);
  let history: CronRun[] = [];
  try { history = JSON.parse(await readFile(file, 'utf-8')); } catch {}
  const idx = history.findIndex((r) => r.startedAt === run.startedAt);
  if (idx >= 0) history[idx] = run;
  else history.push(run);
  if (history.length > 100) history = history.slice(-100);
  await writeFile(file, JSON.stringify(history, null, 2));
}

export async function getRunHistory(cronName: string): Promise<CronRun[]> {
  try {
    return JSON.parse(
      await readFile(join(RUN_HISTORY_DIR, `${cronName}.json`), 'utf-8')
    ) as CronRun[];
  } catch {
    return [];
  }
}
