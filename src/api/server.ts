import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { getConnectionStatus, listGroups } from '../channels/whatsapp/index.js';
import { executeJob, getCronJob, getRunHistory } from '../cron/manager.js';

export const API_PORT = 7331;
const API_HOST = '127.0.0.1';

function json(res: ServerResponse, code: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${API_HOST}`);
  const { pathname: p, method: m = 'GET' } = { pathname: url.pathname, method: req.method };

  try {
    if (m === 'GET' && p === '/status') {
      json(res, 200, { gateway: 'running', whatsapp: getConnectionStatus() });
    } else if (m === 'GET' && p === '/channels/whatsapp/status') {
      json(res, 200, { status: getConnectionStatus() });
    } else if (m === 'GET' && p === '/channels/whatsapp/groups') {
      json(res, 200, { groups: await listGroups() });
    } else if (m === 'POST' && p.startsWith('/cron/run/')) {
      const name = p.slice('/cron/run/'.length);
      const job = await getCronJob(name);
      if (!job) { json(res, 404, { error: `Cron job '${name}' not found` }); return; }
      const result = await executeJob(job);
      json(res, 200, { result });
    } else if (m === 'GET' && p.startsWith('/cron/runs/')) {
      const name = p.slice('/cron/runs/'.length);
      json(res, 200, { runs: await getRunHistory(name) });
    } else {
      json(res, 404, { error: 'Not found' });
    }
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
}

export function startApiServer(): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer(handle);
    server.listen(API_PORT, API_HOST, () => {
      console.log(`[api] listening on ${API_HOST}:${API_PORT}`);
      resolve();
    });
  });
}
