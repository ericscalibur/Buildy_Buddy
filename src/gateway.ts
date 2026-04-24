import { writeFile, unlink } from 'fs/promises';
import { initDirectories, PID_FILE } from './config/loader.js';
import { connect } from './channels/whatsapp/index.js';
import { startScheduler } from './cron/manager.js';
import { startApiServer } from './api/server.js';

export async function startGateway() {
  await initDirectories();
  await writeFile(PID_FILE, String(process.pid), 'utf-8');

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.log('Starting OpenClaw gateway...');
  await startApiServer();
  await connect();
  await startScheduler();
  console.log('OpenClaw gateway running. Press Ctrl+C to stop.');
}

async function cleanup() {
  console.log('\nShutting down...');
  try { await unlink(PID_FILE); } catch {}
  process.exit(0);
}
