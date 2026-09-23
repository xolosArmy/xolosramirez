import { loadXr1fRoConfig } from './config.mjs';
import { loadPinnedChronikReader } from './provider-loader.mjs';
import { createXr1fRoService } from './service.mjs';

async function main() {
  const config = loadXr1fRoConfig(process.env);
  const chronikReader = await loadPinnedChronikReader(config);
  const service = createXr1fRoService({
    config,
    chronikReader,
    logger: console,
  });

  const address = await service.listen();
  console.log(JSON.stringify({
    event: 'xr1f_ro_listening',
    gate: config.gate,
    mode: config.mode,
    host: address.address,
    port: address.port,
    enabled: config.enabled,
    realFundsAuthorized: false,
    x402Commit: config.x402Commit,
    buildSha: config.buildSha,
  }));

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => {
      console.log(JSON.stringify({
        event: 'xr1f_ro_shutdown',
        signal,
      }));
      await service.close();
      process.exit(0);
    });
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    event: 'xr1f_ro_startup_failed',
    code: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
  }));
  process.exit(1);
});
