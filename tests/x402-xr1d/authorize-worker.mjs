import { parentPort, workerData } from 'node:worker_threads';
import {
  SqliteXr1dEntitlementStore,
  Xr1dStoreError,
} from '../../src/x402-xr1d/durable-entitlement-store.mjs';

let store;
try {
  store = new SqliteXr1dEntitlementStore({ path: workerData.path });
  parentPort.postMessage(store.authorizeAccess(workerData.input));
} catch (error) {
  if (error instanceof Xr1dStoreError) {
    parentPort.postMessage({
      ok: false,
      outcome: error.retryable ? 'RETRYABLE' : 'STORAGE_FAILURE',
      code: error.code,
      retryable: error.retryable,
    });
  } else {
    throw error;
  }
} finally {
  store?.close();
}
