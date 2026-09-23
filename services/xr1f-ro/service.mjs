import { createServer } from 'node:http';
import {
  probeC3bStoreReadOnly,
  probeChronikReadOnly,
  probeXr1dStoreReadOnly,
} from './probes.mjs';

function json(response, statusCode, body, headOnly = false) {
  const payload = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('content-length', Buffer.byteLength(payload));
  response.end(headOnly ? undefined : payload);
}

function publicFailure(error) {
  const code =
    error && typeof error.message === 'string' && error.message.startsWith('XR1F_RO_')
      ? error.message
      : 'XR1F_RO_READINESS_FAILED';
  return code;
}

export function createXr1fRoService({
  config,
  chronikReader,
  logger = console,
}) {
  async function readiness() {
    if (config.enabled !== true) {
      return {
        ok: false,
        code: 'XR1F_RO_DISABLED',
      };
    }

    try {
      const c3b = probeC3bStoreReadOnly(config.c3bDbPath);
      const xr1d = probeXr1dStoreReadOnly(config.xr1dDbPath);
      const chronik = await probeChronikReadOnly({
        reader: chronikReader,
        txid: config.chronikProbeTxid,
        timeoutMs: config.chronikTimeoutMs,
      });

      return {
        ok: true,
        status: 'READ_ONLY_READY',
        mode: config.mode,
        realFundsAuthorized: false,
        checks: {
          x402Pin: 'ok',
          c3bStore: c3b.ok ? 'ok' : 'failed',
          xr1dStore: xr1d.ok ? 'ok' : 'failed',
          chronik: chronik.ok ? 'ok' : 'failed',
        },
      };
    } catch (error) {
      logger.error?.({
        event: 'xr1f_ro_readiness_failed',
        code: publicFailure(error),
      });
      return {
        ok: false,
        code: publicFailure(error),
      };
    }
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://xr1f-ro.invalid');
    const headOnly = request.method === 'HEAD';

    if (url.pathname === '/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('allow', 'GET, HEAD');
        json(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      json(
        response,
        200,
        {
          status: 'alive',
          gate: config.gate,
          mode: config.mode,
          buildSha: config.buildSha,
          realFundsAuthorized: false,
        },
        headOnly,
      );
      return;
    }

    if (url.pathname === '/ready') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('allow', 'GET, HEAD');
        json(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }

      const result = await readiness();
      if (!result.ok) {
        json(
          response,
          503,
          {
            status: 'not_ready',
            gate: config.gate,
            mode: config.mode,
            realFundsAuthorized: false,
            code: result.code,
          },
          headOnly,
        );
        return;
      }

      json(
        response,
        200,
        {
          ...result,
          gate: config.gate,
          buildSha: config.buildSha,
        },
        headOnly,
      );
      return;
    }

    json(response, 404, { error: 'NOT_FOUND' });
  });

  return Object.freeze({
    server,
    readiness,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, resolve);
      });
      return server.address();
    },
    async close() {
      if (!server.listening) return;
      await new Promise(resolve => server.close(resolve));
    },
  });
}
