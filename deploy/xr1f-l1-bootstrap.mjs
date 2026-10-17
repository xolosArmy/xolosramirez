import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = '/opt/xolosramirez';
const X402_ROOT = '/opt/x402-xec';
const GIT_BIN = '/usr/bin/git';
const EXPECTED_X402_COMMIT =
  '0f409dea2959b397ecc4bb84d71519ec6e3aec04';
const EXPECTED_X402_INDEX_SHA256 =
  '2808191f97ecfb026c4c40bc3c4ccdf17028aaf34dd44038877547a0973f7782';
const EXPECTED_X402_DIST_SHA256 =
  'd14608db556875bd90221d9953f0703207e0fd11dc6db984937b717c15930f57';

const PROJECT_RUNTIME_PATHS = Object.freeze(new Set([
  'services/xr1f-l1/ceremony.core.mjs',
  'services/xr1f-l1/config.mjs',
  'services/xr1f-ro/probes.mjs',
  'src/x402-xr1f-l1/allocator.mjs',
  'src/x402-xr1f-l1/allocator-worker.mjs',
  'src/x402-xr1f-l1/binding.mjs',
  'src/x402-xr1f-l1/migrations/001_allocator_binding.sql',
]));

function gitEnv() {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  };
}

function runGit(repoRoot, args, { binary = false } = {}) {
  return spawnSync(
    GIT_BIN,
    [
      '-c',
      'core.fsmonitor=false',
      '-c',
      `safe.directory=${repoRoot}`,
      '-C',
      repoRoot,
      ...args,
    ],
    {
      env: gitEnv(),
      encoding: binary ? null : 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function requiredLowerHex(env, name, length) {
  const value = env[name]?.trim();
  const pattern = new RegExp(`^[0-9a-f]{${length}}$`);
  if (!value || !pattern.test(value)) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function currentHead(repoRoot) {
  const result = runGit(
    repoRoot,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
  );
  if (result.error || result.status !== 0) {
    throw new Error('XR1F_L1_BOOTSTRAP_HEAD_UNAVAILABLE');
  }
  const sha = String(result.stdout ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('XR1F_L1_BOOTSTRAP_HEAD_INVALID');
  }
  return sha;
}

function objectFormat(repoRoot) {
  const result = runGit(
    repoRoot,
    ['rev-parse', '--show-object-format'],
  );
  if (result.error || result.status !== 0) {
    throw new Error('XR1F_L1_BOOTSTRAP_OBJECT_FORMAT_UNAVAILABLE');
  }
  const value = String(result.stdout ?? '').trim().toLowerCase();
  if (value !== 'sha1' && value !== 'sha256') {
    throw new Error('XR1F_L1_BOOTSTRAP_OBJECT_FORMAT_UNSUPPORTED');
  }
  return value;
}

function splitNul(buffer) {
  const records = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    records.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start !== buffer.length) {
    throw new Error('XR1F_L1_BOOTSTRAP_TREE_INVALID');
  }
  return records;
}

function splitSlash(buffer) {
  const parts = [];
  let start = 0;
  for (let index = 0; index <= buffer.length; index += 1) {
    if (index !== buffer.length && buffer[index] !== 0x2f) continue;
    parts.push(buffer.subarray(start, index));
    start = index + 1;
  }
  return parts;
}

function validateRelativePath(path) {
  if (path.length === 0 || path[0] === 0x2f) {
    throw new Error('XR1F_L1_BOOTSTRAP_PATH_INVALID');
  }
  for (const part of splitSlash(path)) {
    if (
      part.length === 0 ||
      (part.length === 1 && part[0] === 0x2e) ||
      (part.length === 2 && part[0] === 0x2e && part[1] === 0x2e)
    ) {
      throw new Error('XR1F_L1_BOOTSTRAP_PATH_INVALID');
    }
  }
}

function parseTreeRecord(record) {
  const tab = record.indexOf(0x09);
  if (tab < 0) throw new Error('XR1F_L1_BOOTSTRAP_TREE_INVALID');

  const metadata = record.subarray(0, tab).toString('ascii');
  const match = metadata.match(
    /^([0-7]{6}) (blob|commit) ([0-9a-f]{40,64})$/,
  );
  if (!match) throw new Error('XR1F_L1_BOOTSTRAP_TREE_INVALID');

  const path = Buffer.from(record.subarray(tab + 1));
  validateRelativePath(path);

  return Object.freeze({
    mode: match[1],
    type: match[2],
    oid: match[3],
    path,
  });
}

function physicalPath(root, path) {
  return Buffer.concat([
    Buffer.from(root.endsWith('/') ? root : `${root}/`),
    path,
  ]);
}

function gitBlobOid(bytes, algorithm) {
  const hash = createHash(algorithm);
  hash.update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'));
  hash.update(bytes);
  return hash.digest('hex');
}

function readPhysicalBlob(root, entry) {
  const path = physicalPath(root, entry.path);
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error('XR1F_L1_BOOTSTRAP_TRACKED_FILE_MISSING');
  }

  if (entry.mode === '120000') {
    if (!stat.isSymbolicLink()) {
      throw new Error('XR1F_L1_BOOTSTRAP_TRACKED_TYPE_MISMATCH');
    }
    return readlinkSync(path, { encoding: 'buffer' });
  }

  if (entry.mode !== '100644' && entry.mode !== '100755') {
    throw new Error('XR1F_L1_BOOTSTRAP_TREE_MODE_UNSUPPORTED');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('XR1F_L1_BOOTSTRAP_TRACKED_TYPE_MISMATCH');
  }

  const expectedExecutable = entry.mode === '100755';
  const actualExecutable = (stat.mode & 0o111) !== 0;
  if (expectedExecutable !== actualExecutable) {
    throw new Error('XR1F_L1_BOOTSTRAP_TRACKED_MODE_MISMATCH');
  }

  return readFileSync(path);
}

function attestProject(expectedSha) {
  if (currentHead(REPO_ROOT) !== expectedSha) {
    throw new Error('XR1F_L1_BOOTSTRAP_BUILD_SHA_MISMATCH');
  }

  const format = objectFormat(REPO_ROOT);
  const tree = runGit(
    REPO_ROOT,
    ['ls-tree', '-rz', '--full-tree', expectedSha],
    { binary: true },
  );
  if (
    tree.error ||
    tree.status !== 0 ||
    !Buffer.isBuffer(tree.stdout) ||
    tree.stdout.length === 0
  ) {
    throw new Error('XR1F_L1_BOOTSTRAP_TREE_UNAVAILABLE');
  }

  const snapshot = new Map();
  for (const raw of splitNul(tree.stdout).filter(item => item.length > 0)) {
    const entry = parseTreeRecord(raw);
    if (entry.type !== 'blob') {
      throw new Error('XR1F_L1_BOOTSTRAP_GITLINK_FORBIDDEN');
    }

    const bytes = readPhysicalBlob(REPO_ROOT, entry);
    if (gitBlobOid(bytes, format) !== entry.oid) {
      throw new Error('XR1F_L1_BOOTSTRAP_PHYSICAL_BLOB_MISMATCH');
    }

    const path = entry.path.toString('utf8');
    if (
      Buffer.from(path, 'utf8').equals(entry.path) &&
      PROJECT_RUNTIME_PATHS.has(path)
    ) {
      snapshot.set(path, Object.freeze({
        mode: entry.mode,
        bytes: Buffer.from(bytes),
      }));
    }
  }

  for (const required of PROJECT_RUNTIME_PATHS) {
    if (!snapshot.has(required)) {
      throw new Error('XR1F_L1_BOOTSTRAP_RUNTIME_GRAPH_INCOMPLETE');
    }
  }

  const status = runGit(
    REPO_ROOT,
    [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignored=no',
      '--',
    ],
  );
  if (status.error || status.status !== 0) {
    throw new Error('XR1F_L1_BOOTSTRAP_STATUS_FAILED');
  }
  if (String(status.stdout ?? '').length !== 0) {
    throw new Error('XR1F_L1_BOOTSTRAP_CHECKOUT_DIRTY');
  }

  if (currentHead(REPO_ROOT) !== expectedSha) {
    throw new Error('XR1F_L1_BOOTSTRAP_HEAD_MOVED');
  }

  return snapshot;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function captureX402(expectedCommit, configuredModulePath) {
  if (expectedCommit !== EXPECTED_X402_COMMIT) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_COMMIT_MISMATCH');
  }
  if (currentHead(X402_ROOT) !== expectedCommit) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_HEAD_MISMATCH');
  }

  const expectedModule =
    '/opt/x402-xec/packages/x402-xec-core/dist/index.js';
  if (configuredModulePath !== expectedModule) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_MODULE_PATH_MISMATCH');
  }

  const distDir = dirname(expectedModule);
  if (realpathSync(distDir) !== distDir) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_DIST_PATH_MISMATCH');
  }

  const names = readdirSync(distDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name)
    .sort();
  if (names.length === 0 || !names.includes('index.js')) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_DIST_EMPTY');
  }

  const files = new Map();
  const manifest = [];
  for (const name of names) {
    const path = resolve(distDir, name);
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      realpathSync(path) !== path
    ) {
      throw new Error('XR1F_L1_BOOTSTRAP_X402_ARTIFACT_INVALID');
    }

    const bytes = readFileSync(path);
    const digest = sha256Hex(bytes);
    files.set(name, Buffer.from(bytes));
    manifest.push(`${digest}  ./${name}\n`);
  }

  if (sha256Hex(files.get('index.js')) !== EXPECTED_X402_INDEX_SHA256) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_INDEX_DIGEST_MISMATCH');
  }
  if (
    sha256Hex(Buffer.from(manifest.join(''), 'utf8')) !==
    EXPECTED_X402_DIST_SHA256
  ) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_DIST_DIGEST_MISMATCH');
  }

  if (currentHead(X402_ROOT) !== expectedCommit) {
    throw new Error('XR1F_L1_BOOTSTRAP_X402_HEAD_MOVED');
  }

  return files;
}

function materialize(projectSnapshot, x402Files, buildSha) {
  const root = mkdtempSync(
    resolve(tmpdir(), `xr1f-l1-${buildSha.slice(0, 12)}-`),
  );

  for (const [relative, entry] of projectSnapshot) {
    const path = resolve(root, relative);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (entry.mode === '120000') {
      throw new Error('XR1F_L1_BOOTSTRAP_RUNTIME_SYMLINK_FORBIDDEN');
    }
    writeFileSync(path, entry.bytes, {
      mode: entry.mode === '100755' ? 0o700 : 0o600,
      flag: 'wx',
    });
  }

  const x402Root = resolve(root, 'vendor/x402-xec-core');
  const x402Dist = resolve(x402Root, 'dist');
  mkdirSync(x402Dist, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(x402Root, 'package.json'),
    '{"type":"module"}\n',
    { mode: 0o600, flag: 'wx' },
  );
  for (const [name, bytes] of x402Files) {
    writeFileSync(resolve(x402Dist, name), bytes, {
      mode: 0o600,
      flag: 'wx',
    });
  }

  return Object.freeze({
    root,
    x402ModulePath: resolve(x402Dist, 'index.js'),
  });
}

async function main() {
  if (process.env.XR1F_L1_BIND_ENABLED !== 'true') {
    console.log(JSON.stringify({
      ok: false,
      status: 'XR1F_L1_BIND_DISABLED',
      gate: 'XR1F-L1',
      mode: 'WATCH_ONLY_ALLOCATOR_READY',
      realFundsAuthorized: false,
    }));
    return;
  }

  const buildSha = requiredLowerHex(
    process.env,
    'XR1F_L1_BUILD_SHA',
    40,
  );
  const x402Commit = requiredLowerHex(
    process.env,
    'XR1F_L1_X402_XEC_COMMIT',
    40,
  );
  const modulePath =
    process.env.XR1F_L1_X402_MODULE_PATH?.trim() ?? '';

  const projectSnapshot = attestProject(buildSha);
  const x402Files = captureX402(x402Commit, modulePath);
  const snapshot = materialize(
    projectSnapshot,
    x402Files,
    buildSha,
  );

  try {
    const env = {
      ...process.env,
      XR1F_L1_X402_MODULE_PATH: snapshot.x402ModulePath,
    };
    const corePath = resolve(
      snapshot.root,
      'services/xr1f-l1/ceremony.core.mjs',
    );
    const { runBindingCeremony } = await import(
      `${pathToFileURL(corePath).href}?build=${buildSha}`
    );
    await runBindingCeremony({
      env,
      attestedBuildSha: buildSha,
    });
  } finally {
    rmSync(snapshot.root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    status: 'XR1F_L1_BIND_FAILED',
    code: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    realFundsAuthorized: false,
  }));
  process.exitCode = 1;
});
