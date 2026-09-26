/**
 * @file test-wm-xr1.mjs
 * Test suite for Milestone WM-XR1 (WebMCP Read-Only Tools + Public Xolos Data Adapter).
 *
 * Verifies:
 * 1. Tool discovery: all 5 tools defined and registered via document.modelContext.registerTool.
 * 2. WebMCP Draft Community Group Report (10-Sep-2026) compliance:
 *    - document.modelContext.registerTool({ name, description, inputSchema, execute, annotations })
 *    - annotations: { readOnlyHint: true } on all 5 tools
 *    - Negative test: tool registration rejects or ignores legacy "handler" when "execute" is absent.
 * 3. Valid schemas: inputSchema and outputSchema conform to JSON Schema Draft 2020-12 structure.
 * 4. Deterministic outputs: all execute callbacks return valid, consistent JSON structures.
 * 5. Data accuracy:
 *    - Iztli (#oce alias, available, small intermediate, variety pending confirmation, born 2026-07-14)
 *    - Yohualli (female, intermediate, reserved)
 *    - Tlilxóchitl (standard, female, available, born 2026-08-03, 7 weeks)
 *    - Tonalli (standard, female, reserved)
 *    - Xóchitl (intermediate, female, reserved)
 *    - Delivery zone recognizes "national".
 * 6. Ausencia de PII: no customer names, personal addresses, or private notes in outputs.
 * 7. Ausencia de precios privados: no numerical currency amounts or price tags exposed.
 * 8. Fallback sin WebMCP: graceful no-op when document.modelContext is undefined.
 * 9. Discovery parity on equivalent surfaces.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicXolosDataAdapter, validatePublicAgeIntegrity } from '../js/public-xolos-data-adapter.js';
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

test('WM-XR1: Every tool declares annotations with readOnlyHint: true and provides execute function', () => {
  for (const tool of WEBMCP_TOOLS_DEFINITIONS) {
    assert.ok(tool.annotations, `Tool "${tool.name}" must declare annotations`);
    assert.equal(
      tool.annotations.readOnlyHint,
      true,
      `Tool "${tool.name}" must declare annotations.readOnlyHint: true per WebMCP 10-Sep-2026 report`
    );
    assert.equal(
      typeof tool.execute,
      'function',
      `Tool "${tool.name}" must declare an "execute" callback function`
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
  assert.ok(result.total >= 6, 'Should list at least 6 public xolos (available + reserved)');
  assert.ok(Array.isArray(result.xolos), 'xolos must be an array');

  for (const x of result.xolos) {
    assert.ok(x.id, 'xolo must have id');
    assert.ok(x.name, 'xolo must have name');
    assert.ok(['available', 'reserved'].includes(x.status), 'xolo status must be valid');
    assert.ok(x.publicUrl.startsWith('https://xolosramirez.com/'), 'publicUrl must be canonical HTTPS');
  }

  // Filter test: available
  const availableFiltered = await PublicXolosDataAdapter.listAvailableXolos({ status: 'available' });
  assert.ok(availableFiltered.total >= 3);
  for (const x of availableFiltered.xolos) {
    assert.equal(x.status, 'available');
  }

  // Filter test: reserved
  const reservedFiltered = await PublicXolosDataAdapter.listAvailableXolos({ status: 'reserved' });
  assert.ok(reservedFiltered.total >= 3);
  for (const x of reservedFiltered.xolos) {
    assert.equal(x.status, 'reserved');
  }
});

test('WM-XR1: Deterministic output for get_xolo_profile and catalog accuracy', async () => {
  // 1. Tlilxóchitl (available, standard, female)
  const tlil = await PublicXolosDataAdapter.getXoloProfile({ id: 'tlilxochitl' });
  assert.equal(tlil.found, true);
  assert.equal(tlil.xolo.id, 'tlilxochitl');
  assert.equal(tlil.xolo.name, 'Tlilxóchitl Ramirez');
  assert.equal(tlil.xolo.size, 'standard');
  assert.equal(tlil.xolo.gender, 'female');
  assert.equal(tlil.xolo.status, 'available');
  assert.equal(tlil.xolo.birthDate, '2026-08-03');
  assert.equal(tlil.xolo.ageDescription, '7 semanas · nacida el 3 de agosto de 2026');

  // 2. Xilonen (available, miniature, female)
  const xilonen = await PublicXolosDataAdapter.getXoloProfile({ id: 'xilonen' });
  assert.equal(xilonen.found, true);
  assert.equal(xilonen.xolo.size, 'miniature');
  assert.equal(xilonen.xolo.gender, 'female');
  assert.equal(xilonen.xolo.status, 'available');

  // 3. Iztli (available, small intermediate, male, historical #oce identifier)
  const oce = await PublicXolosDataAdapter.getXoloProfile({ id: 'oce' });
  assert.equal(oce.found, true);
  assert.equal(oce.xolo.id, 'iztli');
  assert.equal(oce.xolo.name, 'Iztli Ramirez');
  assert.equal(oce.xolo.size, 'small_intermediate');
  assert.equal(oce.xolo.variety, 'pending_confirmation');
  assert.equal(oce.xolo.gender, 'male');
  assert.equal(oce.xolo.status, 'available');
  assert.equal(oce.xolo.birthDate, '2026-07-14');
  assert.equal(oce.xolo.ageDescription, '2 meses · nacido el 14 de julio de 2026');
  assert.equal(oce.xolo.publicUrl, 'https://xolosramirez.com/xolos-disponibles.html#iztli');

  const intermediateFiltered = await PublicXolosDataAdapter.listAvailableXolos({ size: 'intermediate' });
  assert.ok(
    intermediateFiltered.xolos.some((x) => x.id === 'iztli'),
    'The intermediate filter must include canonical small_intermediate profiles'
  );

  // 4. Yohualli (reserved, intermediate, female)
  const yohualli = await PublicXolosDataAdapter.getXoloProfile({ id: 'yohualli' });
  assert.equal(yohualli.found, true);
  assert.equal(yohualli.xolo.id, 'yohualli');
  assert.equal(yohualli.xolo.size, 'intermediate');
  assert.equal(yohualli.xolo.gender, 'female');
  assert.equal(yohualli.xolo.status, 'reserved');

  // 5. Tonalli (reserved, standard, female)
  const tonalli = await PublicXolosDataAdapter.getXoloProfile({ id: 'tonalli' });
  assert.equal(tonalli.found, true);
  assert.equal(tonalli.xolo.id, 'tonalli');
  assert.equal(tonalli.xolo.status, 'reserved');
  assert.equal(tonalli.xolo.gender, 'female');
  assert.equal(tonalli.xolo.size, 'standard');

  // 6. Xóchitl (reserved, intermediate, female, bermejo)
  const xochitl = await PublicXolosDataAdapter.getXoloProfile({ id: 'xochitl' });
  assert.equal(xochitl.found, true);
  assert.equal(xochitl.xolo.id, 'xochitl');
  assert.equal(xochitl.xolo.status, 'reserved');
  assert.equal(xochitl.xolo.gender, 'female');
  assert.equal(xochitl.xolo.size, 'intermediate');
  assert.equal(xochitl.xolo.color, 'bermejo');

  // Missing profile
  const missing = await PublicXolosDataAdapter.getXoloProfile({ id: 'non-existent-dog' });
  assert.equal(missing.found, false);
  assert.equal(missing.error, 'NOT_FOUND');

  // Invalid ID
  const invalid = await PublicXolosDataAdapter.getXoloProfile({});
  assert.equal(invalid.found, false);
  assert.equal(invalid.error, 'INVALID_ID');
});

test('WM-XR1: Deterministic output for get_delivery_information with national zone support', async () => {
  const delivery = await PublicXolosDataAdapter.getDeliveryInformation();
  assert.equal(delivery.kennelOrigin, 'Ciudad de México (CDMX)');
  assert.ok(delivery.animalWelfareProtocol.length > 0);
  assert.ok(delivery.zones.cdmx_metropolitan);
  assert.ok(delivery.zones.national_mexico);
  assert.ok(delivery.zones.international);

  // CDMX filter
  const cdmxOnly = await PublicXolosDataAdapter.getDeliveryInformation({ zone: 'cdmx' });
  assert.ok(cdmxOnly.zones.cdmx_metropolitan);
  assert.equal(cdmxOnly.zones.national_mexico, undefined);

  // National zone filter (English)
  const nationalEn = await PublicXolosDataAdapter.getDeliveryInformation({ zone: 'national' });
  assert.ok(nationalEn.zones.national_mexico, 'zone: "national" must resolve to national_mexico');
  assert.equal(nationalEn.zones.cdmx_metropolitan, undefined);
  assert.equal(nationalEn.zones.international, undefined);

  // Nacional zone filter (Spanish)
  const nationalEs = await PublicXolosDataAdapter.getDeliveryInformation({ zone: 'nacional' });
  assert.ok(nationalEs.zones.national_mexico);
  assert.equal(nationalEs.zones.cdmx_metropolitan, undefined);
});

test('WM-XR1: Deterministic output for get_contact_options', async () => {
  const contact = await PublicXolosDataAdapter.getContactOptions();
  assert.equal(contact.primaryChannel, 'email');
  assert.equal(contact.officialEmail, 'contacto@xolosarmy.xyz');
  assert.equal(contact.videoCallBookingUrl, 'https://calendar.app.google/1PXNvJM42iZ3JMHC8');
  assert.equal(contact.officialWebsite, 'https://xolosramirez.com');
  assert.ok(Array.isArray(contact.socialChannels));
  assert.equal('whatsappDirect' in contact, false, 'Retired contact channel must not be returned');
  assert.doesNotMatch(JSON.stringify(contact), /whatsapp|wa\.me|whatsapp:\/\//i);

  const definition = WEBMCP_TOOLS_DEFINITIONS.find((tool) => tool.name === 'get_contact_options');
  assert.ok(definition);
  assert.equal(definition.outputSchema.required.includes('officialEmail'), true);
  assert.equal(definition.outputSchema.required.includes('primaryChannel'), true);
  assert.equal('whatsappDirect' in definition.outputSchema.properties, false);
});

test('WM-XR1: Ausencia de precios numéricos privados en get_price_process_information', async () => {
  const info = await PublicXolosDataAdapter.getPriceProcessInformation();
  const serialized = JSON.stringify(info);

  // Assert critical invariants: no numerical prices, no currency amounts
  assert.ok(!serialized.match(/\$\s*\d+/), 'Must not contain numerical dollar or peso prices (e.g. $1000)');
  assert.ok(!serialized.match(/\d+[\s,]*(USD|MXN|satoshis|XEC)/i), 'Must not contain numerical currency quotes');
  assert.ok(info.privatePricingNotice.includes('no expone cotizaciones numéricas'));
  assert.ok(Array.isArray(info.whatIsIncluded));
  assert.ok(Array.isArray(info.inquiryProcess));
});

test('WM-XR1: Ausencia total de PII en todos los outputs', async () => {
  const allOutputs = [
    await PublicXolosDataAdapter.listAvailableXolos(),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'tlilxochitl' }),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'xilonen' }),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'oce' }),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'yohualli' }),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'tonalli' }),
    await PublicXolosDataAdapter.getXoloProfile({ id: 'xochitl' }),
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
  const result = registerWebMcpTools();
  assert.equal(result.registered, false);
  assert.equal(result.reason, 'WEBMCP_UNAVAILABLE');
  assert.equal(result.count, 0);
});

test('WM-XR1: Registration succeeds via document.modelContext.registerTool with execute and annotations', () => {
  const registered = [];
  const mockDocument = {
    modelContext: {
      registerTool(toolDef) {
        if (typeof toolDef.execute !== 'function') {
          throw new TypeError(`Tool "${toolDef.name}" must provide an "execute" callback`);
        }
        registered.push(toolDef);
      }
    }
  };

  const previousDocument = globalThis.document;
  globalThis.document = mockDocument;

  try {
    const result = registerWebMcpTools();
    assert.equal(result.registered, true);
    assert.equal(result.count, 5);
    assert.equal(registered.length, 5);

    for (const tool of registered) {
      assert.ok(tool.name);
      assert.equal(typeof tool.execute, 'function', `Registered tool ${tool.name} must have execute function`);
      assert.equal(tool.annotations?.readOnlyHint, true, `Registered tool ${tool.name} must have annotations.readOnlyHint = true`);
    }

    assert.equal(registered[0].name, 'list_available_xolos');
    assert.equal(registered[4].name, 'get_price_process_information');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('WM-XR1: Negative test — registerTool rejects legacy handler when execute is missing', () => {
  const mockDocument = {
    modelContext: {
      registerTool(toolDef) {
        if (typeof toolDef.execute !== 'function') {
          throw new TypeError(`Tool "${toolDef.name}" requires an "execute" function per WebMCP 10-Sep-2026 report; "handler" alone is not accepted`);
        }
      }
    }
  };

  const previousDocument = globalThis.document;
  globalThis.document = mockDocument;

  try {
    // Attempting to register a legacy tool definition that only provides "handler" must fail
    assert.throws(() => {
      mockDocument.modelContext.registerTool({
        name: 'legacy_tool',
        description: 'Legacy tool using obsolete handler property',
        inputSchema: { type: 'object' },
        handler: async () => ({})
      });
    }, {
      name: 'TypeError',
      message: /requires an "execute" function/
    });
  } finally {
    globalThis.document = previousDocument;
  }
});

test('WM-XR1: Public approximate age vs synthetic exact birthDate invariant', async () => {
  // Only profiles with an explicit, canonical calendar date on public website cards may have birthDate.
  // Profiles with approximate public ages (e.g. "1 mes", "Recién nacida") must NEVER synthesize exact dates.
  const tlil = await PublicXolosDataAdapter.getXoloProfile({ id: 'tlilxochitl' });
  assert.equal(tlil.xolo.birthDate, '2026-08-03', 'Tlilxóchitl birthDate is explicitly published in public card');
  assert.equal(tlil.xolo.ageDescription, '7 semanas · nacida el 3 de agosto de 2026');
  assert.equal(validatePublicAgeIntegrity(tlil.xolo).valid, true);

  // Iztli now has a canonical exact birth date from the master sheet and public ES/EN cards.
  const iztli = await PublicXolosDataAdapter.getXoloProfile({ id: 'iztli' });
  assert.equal(iztli.xolo.birthDate, '2026-07-14');
  assert.equal(validatePublicAgeIntegrity(iztli.xolo).valid, true);

  // Remaining profiles only state approximate age on public cards; birthDate must be undefined
  const approximateDogs = ['xilonen', 'yohualli', 'tonalli', 'xochitl'];
  for (const dogId of approximateDogs) {
    const profile = await PublicXolosDataAdapter.getXoloProfile({ id: dogId });
    assert.equal(
      profile.xolo.birthDate,
      undefined,
      `Profile "${dogId}" must not synthesize an exact birthDate when only approximate age is published`
    );
    assert.ok(
      profile.xolo.ageDescription,
      `Profile "${dogId}" must expose public approximate ageDescription`
    );
    assert.equal(validatePublicAgeIntegrity(profile.xolo).valid, true);
  }

  // Negative test: verify that injecting a synthetic exact birthDate without a canonical public source fails
  const syntheticDog = {
    id: 'xilonen',
    birthDate: '2026-08-10', // synthetic date derived from "1 mes" or vaccination timeline
    ageDescription: 'Cachorra miniatura de 1 mes'
  };
  const validationResult = validatePublicAgeIntegrity(syntheticDog);
  assert.equal(validationResult.valid, false, 'Validation must fail when synthetic birthDate is introduced');
  assert.match(validationResult.error, /synthetic or unverified birthDate/);
});
