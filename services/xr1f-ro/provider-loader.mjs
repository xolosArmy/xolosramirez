import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export async function loadPinnedChronikReader(config) {
  const modulePath = resolve(config.providerModulePath);
  const actualHash = sha256File(modulePath);
  if (actualHash !== config.providerSha256) {
    throw new Error('XR1F_RO_PROVIDER_INTEGRITY_MISMATCH');
  }

  const module = await import(pathToFileURL(modulePath).href);
  if (typeof module.RealChronikTxProvider !== 'function') {
    throw new Error('XR1F_RO_PROVIDER_EXPORT_MISSING');
  }

  const reader = new module.RealChronikTxProvider({
    endpoint: config.chronikEndpoint,
  });

  if (!reader || typeof reader.getTx !== 'function') {
    throw new Error('XR1F_RO_PROVIDER_READER_INVALID');
  }

  return reader;
}
