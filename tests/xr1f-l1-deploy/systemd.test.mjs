import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const UNIT = new URL(
  '../../deploy/systemd/xr1f-l1.service',
  import.meta.url,
);

test('1. XR1F-L1 unit is manual one-shot and never a resident daemon', () => {
  const source = readFileSync(UNIT, 'utf8');

  assert.match(source, /^Type=oneshot$/m);
  assert.equal(source.includes('RemainAfterExit=yes'), false);
  assert.equal(source.includes('[Install]'), false);
});

test('2. XR1F-L1 unit has no network and no ambient capabilities', () => {
  const source = readFileSync(UNIT, 'utf8');

  assert.match(source, /^PrivateNetwork=true$/m);
  assert.match(source, /^NoNewPrivileges=true$/m);
  assert.match(source, /^CapabilityBoundingSet=$/m);
  assert.match(source, /^AmbientCapabilities=$/m);
});

test('3. XR1F-L1 unit only grants writes to XR1F production state', () => {
  const source = readFileSync(UNIT, 'utf8');

  assert.match(source, /^ReadOnlyPaths=\/opt\/xolosramirez$/m);
  assert.match(source, /^ReadOnlyPaths=\/opt\/x402-xec$/m);
  assert.match(source, /^ReadOnlyPaths=\/etc\/xolosramirez$/m);
  assert.match(source, /^ReadWritePaths=\/srv\/xolosramirez\/xr1f$/m);
});
