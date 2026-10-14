// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { openRepository } from '../app/lib/database.js';
import { HerdUI } from '../app/lib/herd-ui.js';
import { commitWorkflow } from '../app/lib/workflows.js';
import { ICONS, ICON_STROKE, icon } from '../app/lib/icons.js';
import { plainLabel, copyProblems } from '../app/lib/copy.js';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
async function setup() {
  const dom = new JSDOM('<main id="herd"></main>', { url: 'https://herd.test/' });
  Object.assign(globalThis, { document: dom.window.document, location: dom.window.location, localStorage: dom.window.localStorage });
  const repo = await openRepository({ factory: new IDBFactory() });
  const root = document.querySelector('main');
  const ui = new HerdUI(root, { repository: () => repo, refresh: async () => {}, message: () => {} });
  return { dom, repo, root, ui, close: () => { repo.close(); dom.window.close(); } };
}
test('icons share one grid and one stroke and the nav uses the same paths', () => {
  const dom = new JSDOM('<!doctype html><html></html>');
  globalThis.document = dom.window.document;
  assert.equal(ICON_STROKE, '1.75');
  for (const [name, path] of Object.entries(ICONS)) {
    assert.match(path, /^[MmLlHhVvCcSsQqTtAaZz0-9 .,+-]+$/, name);
    const node = icon(name);
    assert.equal(node.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(node.getAttribute('stroke-width'), '1.75');
    assert.equal(node.getAttribute('aria-hidden'), 'true');
    assert.equal(node.querySelector('path').getAttribute('d'), path);
  }
  const html = read('app/index.html');
  for (const name of ['home', 'animals', 'plus', 'backup']) assert.ok(html.includes(ICONS[name]), name);
  assert.doesNotMatch(read('app/styles.css'), /\.home-work \.quick-action svg \{display:none/);
  assert.doesNotMatch(read('app/lib/icons.js'), /\u2014/);
  dom.window.close();
});
test('home tiles, today rows and empty activity show icons with names', async () => {
  const h = await setup();
  try {
    await h.ui.render(await h.repo.snapshot(), 'dashboard');
    const tiles = [...h.root.querySelectorAll('.home-work .quick-action')];
    assert.equal(tiles.length, 7);
    for (const tile of tiles) {
      assert.ok(tile.querySelector('svg'));
      assert.ok(tile.getAttribute('aria-label'));
      assert.equal(copyProblems(tile.getAttribute('aria-label')).length, 0);
    }
    assert.ok(h.root.querySelector('.home-backup, [data-place="home"]'));
    assert.ok(h.root.querySelector('.empty-state svg'));
    assert.equal(h.root.querySelectorAll('.snapshot-tile svg').length, 6);
  } finally { h.close(); }
});
test('animal rows lead with an icon and a hold badge', async () => {
  const h = await setup();
  try {
    const animal = await commitWorkflow(h.repo, await h.repo.snapshot(), 'animal', { farmId: 'Rosie 215', visualTag: '215', sex: 'female' });
    await commitWorkflow(h.repo, await h.repo.snapshot(), 'treatment', {
      animalId: animal.id, administrationPrecision: 'date-only', administrationDate: '2026-10-01', product: 'LA-200', doseValue: '5', doseUnit: 'mL', route: 'SC', injectionSite: 'Neck', reason: 'Vet plan', administrator: 'Scott', instructionReference: 'Bottle label',
      'meat:state': 'duration', 'meat:value': '28', 'meat:unit': 'days', 'meat:source': 'label', 'meat:instructionReference': 'Bottle label', 'milk:state': 'unknown',
    });
    await h.ui.render(await h.repo.snapshot(), 'animals');
    const row = h.root.querySelector('.animal-list .list-row');
    assert.ok(row.querySelector('svg'));
    assert.match(row.textContent, /On a hold/);
    assert.match(row.textContent, /Needs a check/);
    assert.equal(row.querySelector('.row-link').getAttribute('href'), `#animals/${animal.id}`);
  } finally { h.close(); }
});
test('guides show a progress bar and the dose series question is plain', async () => {
  const h = await setup();
  try {
    const animal = await commitWorkflow(h.repo, await h.repo.snapshot(), 'animal', { farmId: 'Rosie 215', sex: 'female' });
    await h.ui.render(await h.repo.snapshot(), `dashboard/quick/treatment/${animal.id}`);
    const form = h.root.querySelector('form');
    const bar = form.querySelector('.progress-bar');
    assert.equal(bar.getAttribute('role'), 'progressbar');
    assert.equal(bar.getAttribute('aria-valuemin'), '1');
    assert.ok(Number(bar.getAttribute('aria-valuemax')) >= Number(bar.getAttribute('aria-valuenow')));
    assert.equal(copyProblems(plainLabel('Start an open course for each selected animal'), { label: true }).length, 0);
    assert.equal(plainLabel('Start an open course for each selected animal'), 'Keep this dose open for more doses later?');
    assert.match(read('app/styles.css'), /@media \(prefers-reduced-motion: reduce\)/);
  } finally { h.close(); }
});
