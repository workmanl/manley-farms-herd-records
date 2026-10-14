import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { setupNewsSignup } from '../app/lib/signup.js';
import { APP_VERSION } from '../app/lib/database.js';
import { FULL_TERMS } from '../app/lib/terms-copy.js';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');
function harness(online = true, response = { ok: true, json: async () => ({}) }) {
  const dom = new JSDOM(read('app/index.html'), { url: 'https://herd.test/tools/herd-records/?datasetId=private#dashboard' });
  const d = dom.window.document, calls = [];
  setupNewsSignup(d, { navigator: { onLine: online }, fetch: async (...args) => { calls.push(args); return response; } });
  return { dom, d, calls, submit: async (email = 'farmer@example.com') => {
    d.querySelector('#news-email').value = email;
    d.querySelector('#news-signup-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
  } };
}
test('signup is only after public FAQ, before source, outside dashboard; footer reveals same form', () => {
  const h = harness(), { d } = h;
  assert.equal(d.querySelector('#public-faq').nextElementSibling.id, 'news-signup');
  assert.match(d.querySelector('#news-signup').nextElementSibling.textContent, /Source repository/);
  assert.equal(d.querySelectorAll('main #news-signup-form').length, 0);
  assert.ok(d.querySelector('#public-intro #news-signup-form'));
  assert.equal(d.querySelectorAll('#news-signup-form').length, 1);
  d.querySelector('#public-intro').open = false;
  d.querySelector('#news-signup-link').click();
  assert.equal(d.querySelector('#public-intro').open, true);
  assert.equal(d.activeElement.id, 'news-email');
  assert.equal(h.calls.length, 0);
  assert.equal(d.querySelector('#news-status').getAttribute('aria-live'), 'polite');
  assert.equal(d.querySelector('#news-signup a').getAttribute('href'), '/privacy/');
  h.dom.window.close();
});
test('no request on initialization, input or focus; submit sends only allowed payload', async () => {
  const h = harness();
  h.d.querySelector('#news-email').dispatchEvent(new h.dom.window.Event('input'));
  h.d.querySelector('#news-email').focus();
  assert.equal(h.calls.length, 0);
  await h.submit(' farmer@example.com ');
  assert.equal(h.calls.length, 1);
  const [url, options] = h.calls[0];
  assert.equal(url, 'https://northwestmediasystems.com/api/capture.php');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.deepEqual(JSON.parse(options.body), { email: 'farmer@example.com', brand: 'manleyfarms', source: 'herd_records_signup', metadata: { path: '/tools/herd-records/', appVersion: APP_VERSION } });
  assert.equal(h.d.querySelector('#news-status').textContent, "You're on the list.");
  h.dom.window.close();
});
test('offline attempts have no request and no queue; invalid input and HTTP errors are announced', async () => {
  const h = harness(false);
  await h.submit();
  assert.equal(h.calls.length, 0);
  assert.equal(h.d.querySelector('#news-status').textContent, "You're offline. Try again when you have signal.");
  h.dom.window.dispatchEvent(new h.dom.window.Event('online'));
  assert.equal(h.calls.length, 0);
  h.dom.window.close();
  const invalid = harness();
  await invalid.submit('bad');
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.d.querySelector('#news-email').getAttribute('aria-invalid'), 'true');
  assert.match(invalid.d.querySelector('#news-status').textContent, /valid email/);
  invalid.dom.window.close();
  const error = harness(true, { ok: false });
  await error.submit();
  assert.equal(error.d.querySelector('#news-status').textContent, 'Something went wrong. Please try again.');
  assert.equal(error.d.querySelector('button[type=submit]').disabled, false);
  error.dom.window.close();
});
test('CSP allows only host and capture origin, font files and licenses are inventoried, typography is local', () => {
  const d = new JSDOM(read('app/index.html')).window.document;
  const csp = d.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  assert.equal(csp.match(/connect-src ([^;]+)/)[1], "'self' https://northwestmediasystems.com");
  assert.match(csp, /font-src 'self';/);
  const ctx = { self: {} }; vm.runInNewContext(read('app/precache.js'), ctx);
  for (const p of ['dm-sans-latin-var.woff2', 'inter-latin-var.woff2', 'DM-Sans-OFL.txt', 'Inter-OFL.txt']) assert.ok(ctx.self.HERD_RELEASE.assets.some(a => a.path === 'fonts/'+p));
  const css = read('app/styles.css');
  assert.match(css, /font-weight: 100 1000;/); assert.match(css, /font-weight: 100 900;/);
  assert.equal((css.match(/font-display: swap/g) || []).length, 2);
  assert.match(css, /body \{\s*font-family: Inter/);
  assert.match(css, /nav \{ font-family: "DM Sans"/);
  for (const p of ['app/source.html','README.md','THIRD_PARTY.md']) for (const font of ['DM Sans','Inter']) assert.ok(read(p).includes(font));
});
test('terms and privacy disclosures describe host requests, elective email and no herd uploads', () => {
  for (const text of [FULL_TERMS, read('app/terms.txt'), read('app/index.html'), read('app/help.html'), read('README.md')]) {
    assert.match(text, /Only if you choose to sign up is your email sent to the Manley Farms mailing list/);
    assert.match(text, /Herd records are never sent/);
    assert.match(text, /Ordinary page and asset requests go to the web host/);
  }
});
test('real service worker never intercepts capture POST or cross-origin GET', () => {
  const listeners = {};
  vm.runInNewContext(read('app/sw.js'), { importScripts() {}, URL, self: { HERD_RELEASE: { version: 'test', assets: [] }, registration: { scope: 'https://herd.test/tools/herd-records/' }, addEventListener: (type, fn) => { listeners[type] = fn; } } });
  for (const method of ['POST','GET']) {
    let intercepted = false;
    listeners.fetch({ request: { method, url: 'https://northwestmediasystems.com/api/capture.php' }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
