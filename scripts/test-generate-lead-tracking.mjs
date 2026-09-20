import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const read = (path) => readFileSync(path, 'utf8');
const main = read('js/main.js');
const leadCode = main.slice(
  main.indexOf('function getLeadElement'),
  main.indexOf('function initializePuppyCarousels')
);

function includes(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message || 'Expected to find ' + needle);
}

function notMatches(haystack, pattern, message) {
  assert.equal(pattern.test(haystack), false, message || 'Unexpected match: ' + pattern);
}

function formTag(html) {
  const match = html.match(/<form[\s\S]*?data-gtm="contact-form"[\s\S]*?>/);
  assert.ok(match, 'Expected contact form with data-gtm="contact-form"');
  return match[0];
}

includes(main, "document.addEventListener('click'", 'Expected delegated click listener');
includes(main, "target.closest('[data-lead-type=\"generate_lead\"]')", 'Expected closest() based lead lookup');
includes(main, "event: 'xolos_generate_lead'", 'Expected xolos_generate_lead event push');
includes(main, "event: 'qualified_contact_intent'", 'Expected qualified_contact_intent event push');
includes(main, "if (cta === 'video_call') return 'video_call';", 'Expected video_call lead channel');
for (const intent of ['price_inquiry', 'profile_inquiry', 'video_call_request', 'contact_form']) {
  includes(main, `'${intent}'`, 'Expected qualified intent allowlist entry ' + intent);
}
notMatches(main, /contact_received/, 'Frontend must never emit contact_received');

for (const key of [
  'lead_channel',
  'cta_location',
  'lead_intent',
  'profile',
  'profile_status',
  'page_type',
  'lang',
]) {
  includes(leadCode, key, 'Expected payload parameter ' + key);
}

notMatches(leadCode, /\bvalue\b/, 'generate_lead must not send value');
notMatches(leadCode, /\bcurrency\b/, 'generate_lead must not send currency');
notMatches(leadCode, /\.value\b|new FormData|FormData\s*\(/, 'generate_lead must not read field values');
notMatches(leadCode, /querySelector(?:All)?\(['"](?:input|textarea|select)/, 'generate_lead must not query form fields');
notMatches(leadCode, /href|Click URL/i, 'generate_lead must not send href or Click URL');

includes(main, 'LEAD_DEDUPLICATION_MS = 1500', 'Expected 1500 ms deduplication window');
includes(main, 'getLeadSignature(payload)', 'Expected signature-based deduplication');
includes(main, "tagName === 'button' && type === 'submit'", 'Click listener must ignore submit buttons');
includes(main, "tagName === 'input' && type === 'submit'", 'Click listener must ignore submit inputs');
includes(main, "element.dataset.cta === 'contact-form'", 'Click listener must ignore contact-form CTA clicks');
includes(main, 'Boolean(element.closest(CONTACT_FORM_SELECTOR))', 'Click listener must ignore leads inside contact forms');
includes(main, "document.addEventListener('submit'", 'Expected delegated submit listener');
includes(main, 'form instanceof HTMLFormElement', 'Submit listener must require HTMLFormElement');
includes(main, "form.matches(CONTACT_FORM_SELECTOR)", 'Submit listener must target contact form');
includes(main, 'form.checkValidity()', 'Submit listener must only measure valid submissions');

const contactEs = read('contacto.html');
const contactEn = read('en/contact.html');
const esForm = formTag(contactEs);
const enForm = formTag(contactEn);
for (const entry of [[esForm, 'es'], [enForm, 'en']]) {
  const tag = entry[0];
  const lang = entry[1];
  includes(tag, 'data-lead-type="generate_lead"');
  includes(tag, 'data-cta="form"');
  notMatches(tag, /data-profile=|data-status=/, 'Generic forms must not invent profile context');
  includes(tag, 'data-page-type="contact"');
  includes(tag, 'data-lang="' + lang + '"');
  includes(tag, 'data-cta-location="contact_form"');
  includes(tag, 'data-lead-intent="contact_form"');
  includes(tag, 'data-gtm="contact-form"');
  includes(tag, 'action="https://formspree.io/f/xbdzegwj"');
  includes(tag, 'method="POST"');
  includes(tag, 'aria-label=');
}

for (const path of ['index.html', 'en/index.html']) {
  const html = read(path);
  assert.ok(/class="[^"]*home-email-float[^"]*"[\s\S]*?data-cta="email"[\s\S]*?data-lead-type="generate_lead"/.test(html), path + ' must keep floating email lead CTA');
}

const floatingPriceExpectations = [
  {
    path: 'index.html',
    lang: 'es',
    pageType: 'home',
    visibleText: 'Preguntar por precio',
    accessibleText: 'Preguntar por precio por correo',
  },
  {
    path: 'en/index.html',
    lang: 'en',
    pageType: 'home',
    visibleText: 'Ask about price',
    accessibleText: 'Ask about price by email',
  },
  {
    path: 'xolos-disponibles.html',
    lang: 'es',
    pageType: 'available-xolos',
    visibleText: 'Preguntar por precio',
    accessibleText: 'Preguntar por precio por correo',
  },
  {
    path: 'en/available-xolos.html',
    lang: 'en',
    pageType: 'available-xolos',
    visibleText: 'Ask about price',
    accessibleText: 'Ask about price by email',
  },
  {
    path: 'contacto.html',
    lang: 'es',
    pageType: 'contact',
    visibleText: 'Preguntar por precio',
    accessibleText: 'Preguntar por precio por correo',
  },
  {
    path: 'en/contact.html',
    lang: 'en',
    pageType: 'contact',
    visibleText: 'Ask about price',
    accessibleText: 'Ask about price by email',
  },
];

for (const expectation of floatingPriceExpectations) {
  const html = read(expectation.path);

  const matches = html.match(
    /<a(?=[^>]*class="[^"]*\bhome-email-float\b[^"]*")[^>]*>[\s\S]*?<\/a>/g
  ) || [];

  assert.equal(
    matches.length,
    1,
    expectation.path + ' must have exactly one floating price CTA'
  );

  const cta = matches[0];

  includes(
    cta,
    'href="mailto:contacto@xolosarmy.xyz?subject=',
    expectation.path + ' must open the primary email channel'
  );

  includes(
    cta,
    'class="home-email-float cta-lead cta-email"',
    expectation.path + ' must use the email floating CTA classes'
  );

  includes(
    cta,
    'target="_blank"',
    expectation.path + ' must open the email client in a new tab context'
  );

  includes(
    cta,
    'rel="noopener noreferrer"',
    expectation.path + ' must isolate the new tab'
  );

  includes(
    cta,
    'data-cta="email"',
    expectation.path + ' must track the email channel'
  );

  includes(
    cta,
    'data-lead-type="generate_lead"',
    expectation.path + ' must keep generate_lead'
  );

  includes(
    cta,
    'data-lead-intent="price_inquiry"',
    expectation.path + ' must declare inquiry intent'
  );

  for (const attribute of [
    'data-cta-location="floating"',
    'data-page-type="' + expectation.pageType + '"',
    'data-lang="' + expectation.lang + '"',
  ]) {
    includes(cta, attribute, expectation.path + ' must keep ' + attribute);
  }

  notMatches(cta, /data-profile=|data-status=/, expectation.path + ' must not invent profile context');

  includes(
    cta,
    'class="home-email-float__text">' + expectation.visibleText + '</span>',
    expectation.path + ' must show the localized inquiry text'
  );

  includes(
    cta,
    'aria-label="' + expectation.accessibleText + '"',
    expectation.path + ' must use the localized aria-label'
  );

  notMatches(
    cta,
    /data-cta="video_call"|data-lead-intent="video_call_request"/i,
    expectation.path + ' must not relabel the floating price CTA as a video call'
  );

  notMatches(cta, /wa\.me|whatsapp:\/\//i, expectation.path + ' must not expose messaging links');
}

const profileExpectations = [
  ['tlilxochitl', 'available', 'Tlilxóchitl Ramirez'],
  ['xilonen', 'available', 'Xilonen Ramirez'],
  ['iztli', 'available', 'Iztli Ramirez'],
  ['yohualli', 'reserved', 'Yohualli Ramirez'],
  ['tonalli', 'reserved', 'Tonalli Ramírez'],
  ['xochitl', 'reserved', 'Xochitl Ramirez'],
];
for (const [path, prefix] of [['xolos-disponibles.html', 'Preguntar por '], ['en/available-xolos.html', 'Ask about ']]) {
  const html = read(path);
  for (const [profile, status, name] of profileExpectations) {
    const match = html.match(new RegExp(`<a(?=[^>]*data-profile="${profile}")(?=[^>]*data-cta-location="profile_card")[^>]*>[\\s\\S]*?<\\/a>`));
    assert.ok(match, path + ' must expose the CTA for ' + profile);
    const cta = match[0];
    includes(cta, 'data-cta="email"');
    includes(cta, 'data-lead-intent="profile_inquiry"');
    includes(cta, 'data-status="' + status + '"');
    includes(cta, 'data-page-type="available-xolos"');
    includes(cta, '>' + prefix + name + '</a>');
  }
}

const activeContactSurfaces = [
  'index.html', 'en/index.html', 'xolos-disponibles.html', 'en/available-xolos.html',
  'contacto.html', 'en/contact.html', 'blog/precio-xoloitzcuintle.html',
  'en/blog/xoloitzcuintli-price.html', 'teyolias-guardiania.html',
  'en/teyolias-guardianship.html', 'public/xolos-disponibles.html', 'js/main.js',
  'js/journey.js', 'js/public-xolos-data-adapter.js', 'js/webmcp-tools.js',
  'css/styles-base.css', 'css/journey.css',
];
for (const path of activeContactSurfaces) {
  notMatches(read(path), /whatsapp|wa\.me|whatsapp:\/\//i, path + ' must not expose the retired public contact channel');
}

for (const [path, primaryLabel, secondaryLabel] of [
  ['contacto.html', 'Correo · canal principal', 'Videollamada'],
  ['en/contact.html', 'Email · primary channel', 'Video call'],
]) {
  const html = read(path);
  assert.ok(html.indexOf(primaryLabel) >= 0, path + ' must identify email as primary');
  assert.ok(html.indexOf(primaryLabel) < html.indexOf(secondaryLabel), path + ' must present email before video call');
}

const sitemap = read('sitemap.xml');
assert.equal((sitemap.match(/<loc>https:\/\/xolosramirez\.com\/xolos-disponibles\.html<\/loc>/g) || []).length, 1);
assert.equal((sitemap.match(/<loc>https:\/\/xolosramirez\.com\/en\/available-xolos\.html<\/loc>/g) || []).length, 1);
notMatches(sitemap, /<loc>[^<]*\/(?:xolos-disponibles|en\/available-xolos)<\/loc>/, 'Sitemap must not contain extensionless availability aliases');

for (const [path, alias, canonical] of [
  ['xolos-disponibles.html', '/xolos-disponibles', '/xolos-disponibles.html'],
  ['en/available-xolos.html', '/en/available-xolos', '/en/available-xolos.html'],
]) {
  const html = read(path);
  includes(html, `window.location.pathname === '${alias}'`, path + ' must detect the extensionless alias');
  includes(html, `window.location.replace('${canonical}' + window.location.search + window.location.hash)`, path + ' must preserve query and fragment when consolidating');
  includes(html, `rel="canonical" href="https://xolosramirez.com${canonical}"`);
}

function walkHtml(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'reports', 'import'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(path));
    else if (extname(entry.name) === '.html') files.push(path);
  }
  return files;
}
for (const path of walkHtml('.')) {
  const html = read(path);
  for (const match of html.matchAll(/\b(?:href|content)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (/xolos-disponibles/i.test(value) && !/^mailto:/i.test(value)) {
      assert.match(value, /xolos-disponibles\.html(?:[?#]|$)/, path + ' has a non-canonical availability link: ' + value);
    }
    if (/available-xolos/i.test(value)) {
      assert.match(value, /available-xolos\.html(?:[?#]|$)/, path + ' has a non-canonical English availability link: ' + value);
    }
  }
}

for (const path of [
  'index.html',
  'en/index.html',
  'xolos-disponibles.html',
  'en/available-xolos.html',
  'contacto.html',
  'en/contact.html',
]) {
  const html = read(path);
  includes(html, 'GTM-MGTMWN7T', path + ' must keep GTM container');
}

for (const path of ['index.html', 'en/index.html', 'xolos-disponibles.html', 'en/available-xolos.html', 'contacto.html', 'en/contact.html']) {
  const html = read(path);
  const inlineLeadPattern = new RegExp('onclick=[^>]*' +
    'generate_lead', 'i');
  const inlineLeadMessage = path + ' must not add inline onclick ' +
    'generate_lead';
  notMatches(html, inlineLeadPattern, inlineLeadMessage);
}

const repoFiles = [
  'js/main.js',
  'index.html',
  'en/index.html',
  'xolos-disponibles.html',
  'en/available-xolos.html',
  'contacto.html',
  'en/contact.html',
];
for (const path of repoFiles) {
  notMatches(read(path), /gtag\(\s*['"]event['"]\s*,\s*['"]generate_lead['"]/i, path + ' must not send generate_lead through gtag');
}

console.log('generate_lead tracking checks passed');
