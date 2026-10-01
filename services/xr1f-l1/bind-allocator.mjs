import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = realpathSync(
  fileURLToPath(new URL('../../', import.meta.url)),
);
const GIT_BIN = '/usr/bin/git';

const SNAPSHOT_PATHS = Object.freeze(new Set([
  'services/xr1f-l1/ceremony.core.mjs',
  'services/xr1f-l1/config.mjs',
  'services/xr1f-ro/probes.mjs',
  'src/x402-xr1f-l1/allocator.mjs',
  'src/x402-xr1f-l1/allocator-worker.mjs',
  'src/x402-xr1f-l1/binding.mjs',
  'src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
]));

function runGit(repoRoot, gitBin, args, { binary = false } = {}) {
  return spawnSync(
    gitBin,
    [
      '-c',
      `safe.directory=${repoRoot}`,
      '-C',
      repoRoot,
      ...args,
    ],
    {
      encoding: binary ? null : 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function expectedBuildSha(env = process.env) {
  const value = env.XR1F_L1_BUILD_SHA?.trim();
  if (!value || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error('XR1F_L1_BUILD_SHA_INVALID');
  }
  return value;
}

export function resolveDeployedBuildSha({
  repoRoot = REPO_ROOT,
  gitBin = GIT_BIN,
} = {}) {
  const result = runGit(
    repoRoot,
    gitBin,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
  );

  if (result.error || result.status !== 0) {
    throw new Error('XR1F_L1_DEPLOYED_BUILD_SHA_UNAVAILABLE');
  }

  const sha = String(result.stdout ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('XR1F_L1_DEPLOYED_BUILD_SHA_INVALID');
  }

  return sha;
}

function gitBlobOid(bytes, algorithm) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  const hash = createHash(algorithm);
  hash.update(header);
  hash.update(bytes);
  return hash.digest('hex');
}

function splitNul(buffer) {
  const records = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] !== 0) continue;
    records.push(buffer.subarray(start, i));
    start = i + 1;
  }
  if (start !== buffer.length) {
    throw new Error('XR1F_L1_DEPLOYED_HEAD_TREE_INVALID');
  }
  return records;
}

function parseTreeRecord(record) {
  const tab = record.indexOf(0x09);
  if (tab < 0) {
    throw new Error('XR1F_L1_DEPLOYED_HEAD_TREE_INVALID');
  }

  const metadata = record.subarray(0, tab).toString('ascii');
  const match = metadata.match(
    /^([0-7]{6}) (blob|commit) ([0-9a-f]{40,64})$/,
  );
  if (!match) {
    throw new Error('XR1F_L1_DEPLOYED_HEAD_TREE_INVALID');
  }

  const path = Buffer.from(record.subarray(tab + 1));
  if (path.length === 0 || path.includes(0)) {
    throw new Error('XR1F_L1_DEPLOYED_TREE_PATH_INVALID');
  }

  return {
    mode: match[1],
    type: match[2],
    oid: match[3],
    path,
  };
}

function validateRelativeGitPath(path) {
  if (path[0] === 0x2f) {
    throw new Error('XR1F_L1_DEPLOYED_TREE_PATH_INVALID');
  }
  const components = splitOnSlash(path);
  if (
    components.some(
      part =>
        part.length === 0 ||
        (part.length === 1 && part[0] === 0x2e) ||
        (part.length === 2 && part[0] === 0x2e && part[1] === 0x2e),
    )
  ) {
    throw new Error('XR1F_L1_DEPLOYED_TREE_PATH_INVALID');
  }
}

function splitOnSlash(path) {
  const parts = [];
  let start = 0;
  for (let i = 0; i <= path.length; i += 1) {
    if (i !== path.length && path[i] !== 0x2f) continue;
    parts.push(path.subarray(start, i));
    start = i + 1;
  }
  return parts;
}

function physicalPath(repoRoot, path) {
  validateRelativeGitPath(path);
  return Buffer.concat([
    Buffer.from(repoRoot.endsWith('/') ? repoRoot : `${repoRoot}/`),
    path,
  ]);
}

function displayPath(path) {
  return path.toString('hex');
}

function readPhysicalEntry({ repoRoot, path, mode }) {
  const fullPath = physicalPath(repoRoot, path);
  let stat;
  try {
    stat = lstatSync(fullPath);
  } catch {
    throw new Error(
      `XR1F_L1_DEPLOYED_PHYSICAL_FILE_MISSING_HEX_${displayPath(path)}`,
    );
  }

  if (mode === '120000') {
    if (!stat.isSymbolicLink()) {
      throw new Error(
        `XR1F_L1_DEPLOYED_PHYSICAL_TYPE_MISMATCH_HEX_${displayPath(path)}`,
      );
    }
    return readlinkSync(fullPath, { encoding: 'buffer' });
  }

  if (mode !== '100644' && mode !== '100755') {
    throw new Error(
      `XR1F_L1_DEPLOYED_TREE_MODE_UNSUPPORTED_${mode}`,
    );
  }

  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      `XR1F_L1_DEPLOYED_PHYSICAL_TYPE_MISMATCH_HEX_${displayPath(path)}`,
    );
  }

  const expectedExecutable = mode === '100755';
  const actualExecutable = (stat.mode & 0o111) !== 0;
  if (actualExecutable !== expectedExecutable) {
    throw new Error(
      `XR1F_L1_DEPLOYED_PHYSICAL_MODE_MISMATCH_HEX_${displayPath(path)}`,
    );
  }

  return readFileSync(fullPath);
}

function assertHeadStillExpected(expectedSha, repoRoot, gitBin) {
  const actual = resolveDeployedBuildSha({ repoRoot, gitBin });
  if (actual !== expectedSha) {
    throw new Error('XR1F_L1_DEPLOYED_HEAD_MOVED');
  }
}

function objectFormat(repoRoot, gitBin) {
  const result = runGit(
    repoRoot,
    gitBin,
    ['rev-parse', '--show-object-format'],
  );
  if (result.error || result.status !== 0) {
    throw new Error('XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED');
  }
  const value = String(result.stdout ?? '').trim().toLowerCase();
  if (value !== 'sha1' && value !== 'sha256') {
    throw new Error('XR1F_L1_DEPLOYED_OBJECT_FORMAT_UNSUPPORTED');
  }
  return value;
}

export function attestExpectedCommit({
  expectedSha,
  repoRoot = REPO_ROOT,
  gitBin = GIT_BIN,
  captureSnapshot = true,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha ?? '')) {
    throw new Error('XR1F_L1_BUILD_SHA_INVALID');
  }

  assertHeadStillExpected(expectedSha, repoRoot, gitBin);
  const format = objectFormat(repoRoot, gitBin);

  const tree = runGit(
    repoRoot,
    gitBin,
    ['ls-tree', '-rz', '--full-tree', expectedSha],
    { binary: true },
  );
  if (
    tree.error ||
    tree.status !== 0 ||
    !Buffer.isBuffer(tree.stdout) ||
    tree.stdout.length === 0
  ) {
    throw new Error('XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED');
  }

  const snapshot = new Map();
  for (const raw of splitNul(tree.stdout).filter(record => record.length > 0)) {
    const entry = parseTreeRecord(raw);
    if (entry.type !== 'blob') {
      throw new Error(
        `XR1F_L1_DEPLOYED_TREE_ENTRY_UNSUPPORTED_HEX_${displayPath(entry.path)}`,
      );
    }

    const bytes = readPhysicalEntry({
      repoRoot,
      path: entry.path,
      mode: entry.mode,
    });
    if (gitBlobOid(bytes, format) !== entry.oid) {
      throw new Error(
        `XR1F_L1_DEPLOYED_PHYSICAL_BLOB_MISMATCH_HEX_${displayPath(entry.path)}`,
      );
    }

    const utf8 = entry.path.toString('utf8');
    if (
      captureSnapshot &&
      Buffer.from(utf8, 'utf8').equals(entry.path) &&
      SNAPSHOT_PATHS.has(utf8)
    ) {
      snapshot.set(utf8, {
        mode: entry.mode,
        bytes: Buffer.from(bytes),
      });
    }
  }

  if (captureSnapshot) {
    for (const required of SNAPSHOT_PATHS) {
      if (!snapshot.has(required)) {
        throw new Error(
          `XR1F_L1_DEPLOYED_SNAPSHOT_FILE_MISSING_${required}`,
        );
      }
    }
  }

  // Defense in depth only. Physical blob identity above is authoritative.
  const indexState = runGit(repoRoot, gitBin, ['ls-files', '-v', '-z', '--']);
  if (indexState.error || indexState.status !== 0) {
    throw new Error('XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED');
  }
  const manipulated = String(indexState.stdout ?? '')
    .split('\0')
    .filter(Boolean)
    .find(entry => !entry.startsWith('H '));
  if (manipulated) {
    throw new Error('XR1F_L1_DEPLOYED_INDEX_FLAGS_FORBIDDEN');
  }

  const porcelain = runGit(
    repoRoot,
    gitBin,
    [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignored=no',
      '--',
    ],
  );
  if (porcelain.error || porcelain.status !== 0) {
    throw new Error('XR1F_L1_DEPLOYED_CHECKOUT_ATTESTATION_FAILED');
  }
  if (String(porcelain.stdout ?? '').length !== 0) {
    throw new Error('XR1F_L1_DEPLOYED_CHECKOUT_DIRTY');
  }

  assertHeadStillExpected(expectedSha, repoRoot, gitBin);

  return Object.freeze({
    expectedSha,
    snapshot,
  });
}

export function assertDeployedCheckoutClean({
  repoRoot = REPO_ROOT,
  gitBin = GIT_BIN,
  expectedSha = resolveDeployedBuildSha({ repoRoot, gitBin }),
} = {}) {
  attestExpectedCommit({
    expectedSha,
    repoRoot,
    gitBin,
    captureSnapshot: false,
  });
  return true;
}

function materializeSnapshot(attestation) {
  const root = mkdtempSync(
    resolve(tmpdir(), `xr1f-l1-attested-${attestation.expectedSha.slice(0, 12)}-`),
  );

  for (const [path, entry] of attestation.snapshot) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });

    if (entry.mode === '120000') {
      symlinkSync(entry.bytes.toString('utf8'), target);
      continue;
    }

    writeFileSync(target, entry.bytes, {
      mode: entry.mode === '100755' ? 0o700 : 0o600,
      flag: 'wx',
    });
    if (entry.mode === '100755') chmodSync(target, 0o700);
  }

  return root;
}

async function launch() {
  if (process.env.XR1F_L1_BIND_ENABLED !== 'true') {
    const result = Object.freeze({
      ok: false,
      status: 'XR1F_L1_BIND_DISABLED',
      gate: 'XR1F-L1',
      mode: 'WATCH_ONLY_ALLOCATOR_READY',
      realFundsAuthorized: false,
    });
    console.log(JSON.stringify(result));
    return result;
  }

  const expectedSha = expectedBuildSha(process.env);
  const attestation = attestExpectedCommit({ expectedSha });
  const snapshotRoot = materializeSnapshot(attestation);

  try {
    // The imported module graph comes only from the private snapshot captured
    // from the same physical reads that matched the immutable expected commit.
    const coreUrl = pathToFileURL(
      resolve(snapshotRoot, 'services/xr1f-l1/ceremony.core.mjs'),
    ).href;
    const { runBindingCeremony } = await import(
      `${coreUrl}?attested=${expectedSha}`
    );
    return await runBindingCeremony({
      env: process.env,
      attestedBuildSha: expectedSha,
    });
  } finally {
    rmSync(snapshotRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  launch().catch(error => {
    console.error(JSON.stringify({
      ok: false,
      status: 'XR1F_L1_BIND_FAILED',
      code: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      realFundsAuthorized: false,
    }));
    process.exitCode = 1;
  });
}
