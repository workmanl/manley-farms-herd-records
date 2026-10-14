import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { FULL_TERMS } from '../app/lib/terms-copy.js';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');
test('updates card follows FAQ and uses exact plain outbound links without a form', () => {
  const dom = new JSDOM(read('app/index.html')), d = dom.window.document;
  assert.equal(d.querySelector('#public-faq').nextElementSibling.id, 'news-signup');
  assert.ok(d.querySelector('#public-intro #news-signup'));
  assert.equal(d.querySelector('#news-signup h2').textContent, 'Get Herd Records updates.');
  assert.equal(d.querySelector('#news-signup form'), null);
  for (const a of [d.querySelector('#news-signup a'), d.querySelector('#news-signup-link')]) {
    assert.equal(a.getAttribute('href'), 'https://manleyfarms.com/herd-records-updates/?from=app');
    assert.equal(a.getAttribute('rel'), 'noopener');
    assert.equal(a.getAttribute('target'), null);
  }
  assert.equal(d.querySelector('#news-signup a').textContent, 'Sign up on manleyfarms.com');
  assert.equal(fs.existsSync(new URL('../app/lib/signup.js', import.meta.url)), false);
  dom.window.close();
});
test('CSP allows only local connections, font files and licenses are inventoried, typography is local', () => {
  const d = new JSDOM(read('app/index.html')).window.document;
  const csp = d.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  assert.equal(csp.match(/connect-src ([^;]+)/)[1], "'self'");
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
    assert.ok(text.includes('Signing up happens on manleyfarms.com. This app never sends your email or herd records anywhere.'));

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

test('real route hides updates on moved builds and entry forms, restores them on new-origin home', () => {
  const route = read('app/app.js').split('function route() {')[1].split('async function bookkeeping')[0];
  for (const moved of [false, true]) for (const path of ['dashboard', 'animals/new', 'dashboard/quick/calving', 'animals']) {
    const dom = new JSDOM(read('app/index.html')), d = dom.window.document;
    const context = { document:d, location:{hash:'#'+path}, DEPLOY:{moved}, repo:{}, accepted:true,
      herd:{render(){}, demoMode:false}, snapshot:{}, ownership:{render(){}},
      $:id=>d.getElementById(id), message(){}, enforceMovedView(){} };
    vm.runInNewContext('function route() {'+route+'; route();', context);
    const hidden = moved || path.includes('/');
    for (const id of ['news-signup', 'news-signup-link']) assert.equal(d.getElementById(id).hidden, hidden, moved+':'+path+':'+id);
    dom.window.close();
  }
});
test('all runtime JavaScript has no capture endpoint or outside request sink; worker fetches local inventory only', () => {
  const files = fs.readdirSync(new URL('../app/', import.meta.url), {recursive:true}).filter(p=>p.endsWith('.js'));
  for (const file of files) {
    const source = read('app/'+file);
    assert.doesNotMatch(source, /northwestmediasystems\.com|XMLHttpRequest|WebSocket|sendBeacon/);
    if (file !== 'sw.js') assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
  assert.match(read('app/sw.js'), /fetch\(assetURL\(asset.path\)/);
  const release = {self:{}}; vm.runInNewContext(read('app/precache.js'), release);
  for (const asset of release.self.HERD_RELEASE.assets) assert.doesNotMatch(asset.path, /^(?:[a-z]+:|\/)/i);
});
