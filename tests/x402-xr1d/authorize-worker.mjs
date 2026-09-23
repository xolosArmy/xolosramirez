import { parentPort, workerData } from 'node:worker_threads';
import { SqliteXr1dEntitlementStore } from '../../src/x402-xr1d/durable-entitlement-store.mjs';

const store = new SqliteXr1dEntitlementStore({ path: workerData.path });
try {
  parentPort.postMessage(store.authorizeAccess(workerData.input));
} finally {
  store.close();
}
