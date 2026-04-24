import { startGateway } from './gateway.js';

startGateway().catch((err) => {
  console.error('Gateway failed:', err);
  process.exit(1);
});
