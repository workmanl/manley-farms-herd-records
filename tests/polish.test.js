// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('checkbox and secondary controls keep at least 48px targets in both themes',()=>{
  const css=read('app/styles.css');
  const checkbox=css.match(/input\[type="checkbox"\]\s*\{([^}]+)\}/)[1];
  for(const property of ['width','height','min-width','min-height']) assert.match(checkbox,new RegExp(`(?:^|[;\\s])${property}: 48px;`));
  assert.match(css,/\.button,\s*button\s*\{[^}]*min-height: 48px/s);
  assert.match(css,/\.secondary\.danger\s*\{[^}]*background:transparent/);
});
test('offline status replaces preparation text with readiness rather than adding another notice',()=>{
  const source=read('app/lib/pwa.js');
  assert.match(source,/readyOffline\(active, status\)\s*\? "Ready offline"\s*: "Getting ready to work offline\.\.\."/);
  assert.doesNotMatch(source,/Offline preparation|schema migration/);
  const dom=new JSDOM(read('app/index.html'));
  assert.equal(dom.window.document.querySelectorAll('#offline-status').length,1);
  assert.equal(dom.window.document.getElementById('backup-reminder'),null);
  dom.window.close();
});
test('visible UI copy drops storage and save jargon without renaming data APIs',()=>{
  for(const path of ['app/app.js','app/lib/herd-ui.js','app/lib/health-ui.js','app/lib/ownership-ui.js','app/lib/pwa.js','app/lib/reports.js']) {
    // Full quoted prose only. Ignore identifiers, imports, regexes and comments.
    const source=read(path);
    for(const match of source.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)) {
      const text=match[1]||match[2];
      if(!text.includes(' ')) continue;
      assert.doesNotMatch(text,/\b(transaction|committed|retained|schema|persist|atomic|atomically|dataset)\b/i,`${path}: ${text}`);
    }
    assert.doesNotMatch(source,/\u2014/,path);
  }
});

test('moved view only disables controls that still exist in the shell',()=>{
  const dom=new JSDOM(read('app/index.html'));
  const source=read('app/app.js');
  const ids=source.match(/for \(const id of \[([^\]]+)\]\) \$\(id\)\.disabled = true/)[1];
  for(const match of ids.matchAll(/'([^']+)'/g)) assert.ok(dom.window.document.getElementById(match[1]),match[1]);
  dom.window.close();
});
