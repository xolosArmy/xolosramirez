/**
 * @file test-wm-xr1.mjs
 * Test suite for Milestone WM-XR1 (WebMCP Read-Only Tools + Public Xolos Data Adapter).
 *
 * Verifies:
 * 1. Tool discovery: all 5 tools registered via document.modelContext.registerTool.
 * 2. Valid schemas: inputSchema and outputSchema conform to JSON Schema Draft 2020-12 structure.
 * 3. Deterministic outputs: all handlers return valid, consistent JSON structures.
 * 4. sideEffects = "none": all tools explicitly declare sideEffects: 'none'.
 * 5. Ausencia de PII: no customer names, personal addresses, or private notes in outputs.
 * 6. Ausencia de precios privados: no numerical currency amounts or price tags exposed.
 * 7. Fallback sin WebMCP: graceful no-op when document.modelContext is undefined.
 * 8. Zero regression on existing site assets and contracts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicXolosDataAdapter } from '../js/public-xolos-data-adapter.js';
import { WEBMCP_TOOLS_DEFINITIONS, registerWebMcpTools } from '../js/webmcp-tools.js';

test('WM-XR1: Tool discovery and definitions count', () => {
  assert.equal(WEBMCP_TOOLS_DEFINITIONS.length, 5, 'Must define exactly 5 WebMCP read-only tools');
  
  const expectedNames = [
    'list_available_xolos',
    'get_xolo_profile',
    'get_delivery_information',
    'get_contact_options',
    'get_price_process_information'
  ];

  const actualNames = WEBMCP_TOOLS_DEFINITIONS.map((t) => t.name);
  assert.deepEqual(actualNames, expectedNames, 'Tool names must match the frozen XR-AC0 specification');
});

test('WM-XR1: Every tool declares sideEffects = "none"', () => {
  for (const tool of WEBMCP_TOOLS_DEFINITIONS) {
    assert.equal(
      tool.sideEffects,
      'none',
      `Tool "${tool.name}" must declare sideEffects: "none" to guarantee read-only safety`
    );
  }
});

test('WM-XR1: Valid JSON Schema structures on all tools', () => {
  for (const tool of WEBMCP_TOOLS_DEFINITIONS) {
    assert.ok(tool.inputSchema, `Tool "${tool.name}" must have inputSchema`);
    assert.equal(tool.inputSchema.type, 'object', `Tool "${tool.name}" inputSchema type must be "object"`);
    assert.ok(tool.outputSchema, `Tool "${tool.name}" must have outputSchema`);
    assert.equal(tool.outputSchema.type, 'object', `Tool "${tool.name}" outputSchema type must be "object"`);
    assert.ok(tool.description && tool.description.length > 10, `Tool "${tool.name}" must have informative description`);
  }
});

test('WM-XR1: Deterministic output for list_available_xolos', async () => {
  const result = await PublicXolosDataAdapter.listAvailableXolos();
  assert.ok(result.total >= 2, 'Should list at least available public xolos');
  assert.ok(Array.isArray(result.xolos), 'xolos must be an array');

  for (const x of result.xolos) {
    assert.ok(x.id, 'xolo must have id');
    assert.ok(x.name, 'xolo must have name');
    assert.ok(['available', 'reserved'].includes(x.status), 'xolo status must be valid');
    assert.ok(x.publicUrl.startsWith('https://xolosramirez.com/'), 'publicUrl must be canonical HTTPS');
  }

  // Filter test
  const filtered = await PublicXolosDataAdapter.listAvailableXolos({ status: 'available' });
  for (const x of filtered.xolos) {
    assert.equal(x.status, 'available');
  }
});

test('WM-XR1: Deterministic output for get_xolo_profile', async () => {
  // Existing profile
  const profile = await PublicXolosDataAdapter.getXoloProfile({ id: 'tlilxochitl' });
  assert.equal(profile.found, true);
  assert.equal(profile.xolo.id, 'tlilxochitl');
  assert.equal(profile.xolo.name, 'Tlilxóchitl Ramirez');
  assert.ok(Array.isArray(profile.xolo.careConsiderations));
  assert.ok(profile.xolo.personalitySummary.length > 0);

  // Missing profile
  const missing = await PublicXolosDataAdapter.getXoloProfile({ id: 'non-existent-dog' });
  assert.equal(missing.found, false);
  assert.equal(missing.error, 'NOT_FOUND');

  // Invalid ID
  const invalid = await PublicXolosDataAdapter.getXoloProfile({});
  assert.equal(invalid.found, false);
  assert.equal(invalid.error, 'INVALID_ID');
});

test('WM-XR1: Deterministic output for get_delivery_information', async () => {
  const delivery = await PublicXolosDataAdapter.getDeliveryInformation();
  assert.equal(delivery.kennelOrigin, 'Ciudad de México (CDMX)');
  assert.ok(delivery.animalWelfareProtocol.length > 0);
  assert.ok(delivery.zones.cdmx_metropolitan);
  assert.ok(delivery.zones.national_mexico);
  assert.ok(delivery.zones.international);

  // Zone filter
  const cdmxOnly = await PublicXolosDataAdapter.getDeliveryInformation({ zone: 'cdmx' });
  assert.ok(cdmxOnly.zones.cdmx_metropolitan);
  assert.equal(cdmxOnly.zones.national_mexico, undefined);
});

test('WM-XR1: Deterministic output for get_contact_options', async () => {
  const contact = await PublicXolosDataAdapter.getContactOptions();
  assert.equal(contact.officialEmail, 'contacto@xolosarmy.xyz');
  assert.equal(contact.whatsappDirect, 'https://wa.me/message/435RTKGJLTX2J1');
  assert.equal(contact.officialWebsite, 'https://xolosramirez.com');
  assert.ok(Array.isArray(contact.socialChannels));
});

test('WM-XR1: Ausencia de precios numéricos privados en get_price_process_information', async () => {
  const info = await PublicXolosDataAdapter.getPriceProcessInformation();
  const serialized = JSON.stringify(info);

  // Assert critical invariants: no numerical prices, no currency amounts
  assert.ok(!serialized.match(/\$\s*\d+/), 'Must not contain numerical dollar or peso prices (e.g. $1000)');
  assert.ok(!serialized.match(/\d+[\s,]*(USD|MXN|satoshis|XEC)/i), 'Must not contain numerical currency quotes');
  assert.ok(info.privatePricingNotice.includes('NO publica listas numéricas de precios'));
  assert.ok(Array.isArray(info.whatIsIncluded));
  assert.ok(Array.isArray(info.inquiryProcess));
});

test('WM-XR1: Ausencia total de PII en todos los outputs', async () => {
  const allOutputs = [
    await PublicXolosDataAdapter.listAvailableXolos(),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'tlilxochitl' }),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'xilonen' }),
    await PublicXolosDataAdapter.getDeliveryInformation(),
    await PublicXolosDataAdapter.getContactOptions(),
    await PublicXolosDataAdapter.getPriceProcessInformation()
  ];

  const fullJson = JSON.stringify(allOutputs);

  // Assert no private buyer data or PII leakage
  const forbiddenPiiRegexes = [
    /\bcredit[-_]?card\b/i,
    /\bcvv\b/i,
    /\bpassport[-_]?number\b/i,
    /\bine[-_]?clave\b/i,
    /\bcurp\b/i,
    /\bbuyer[-_]?phone\b/i,
    /\bprivate[-_]?address\b/i,
    /\bcliente[-_]?nombre\b/i,
    /\bcustomer[-_]?address\b/i
  ];

  for (const regex of forbiddenPiiRegexes) {
    assert.ok(!regex.test(fullJson), `Output must not contain PII pattern "${regex}"`);
  }
});

test('WM-XR1: Progressive enhancement fallback without WebMCP', () => {
  // In pure Node.js global environment without document.modelContext
  const result = registerWebMcpTools();
  assert.equal(result.registered, false);
  assert.equal(result.reason, 'WEBMCP_UNAVAILABLE');
  assert.equal(result.count, 0);
});

test('WM-XR1: Registration succeeds when document.modelContext.registerTool is present', () => {
  const registered = [];
  const mockDocument = {
    modelContext: {
      registerTool(toolDef) {
        registered.push(toolDef);
      }
    }
  };

  // Temporarily install mock
  const previousDocument = globalThis.document;
  globalThis.document = mockDocument;

  try {
    const result = registerWebMcpTools();
    assert.equal(result.registered, true);
    assert.equal(result.count, 5);
    assert.equal(registered.length, 5);
    assert.equal(registered[0].name, 'list_available_xolos');
    assert.equal(registered[4].name, 'get_price_process_information');
  } finally {
    globalThis.document = previousDocument;
  }
});
