// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { openRepository } from '../app/lib/database.js';
import { commitWorkflow, prepareWorkflow } from '../app/lib/workflows.js';
import { chuteSaleInput, chuteWeightInput, saveChuteSale, saveChuteWeights } from '../app/lib/chute.js';
import { HerdUI } from '../app/lib/herd-ui.js';

const source = readFileSync(new URL('../app/lib/chute.js', import.meta.url), 'utf8');
const fresh = () => openRepository({ factory: new IDBFactory() });
const animal = async (repo, data = {}) => commitWorkflow(repo, await repo.snapshot(), 'animal', {
  farmId: '001', sex: 'steer', effectiveDate: '2026-10-01', ...data,
});

test('chute saves stay on the weight and sale paths', () => {
  assert.doesNotMatch(source, /\.put\(/);
  assert.doesNotMatch(readFileSync(new URL('../app/lib/herd-ui.js', import.meta.url), 'utf8'), /\.put\(/);
});

test('fifty chute weights match fifty single saves and a stop leaves only finished animals', async () => {
  const repo = await fresh();
  try {
    const ids = [];
    for (let i = 0; i < 50; i += 1) ids.push((await animal(repo, { farmId: String(i).padStart(3, '0') })).id);
    const before = await repo.snapshot();
    const shared = { date: '2026-10-01', type: 'other', unit: 'lb' };
    const values = Object.fromEntries(ids.map((id, index) => [id, String(400 + index)]));
    const saved = await saveChuteWeights(repo, ids, shared, values);
    assert.equal(saved.length, 50);
    const snap = await repo.snapshot();
    assert.equal(snap.weights.length, 50);
    for (const id of ids) {
      const row = snap.weights.find((weight) => weight.animalId === id);
      const planned = prepareWorkflow(before, 'weight', chuteWeightInput(id, shared, values[id])).result;
      for (const key of ['animalId', 'date', 'type', 'value', 'unit', 'notes', 'calvingId']) assert.equal(row[key], planned[key], key);
    }
    const partialRepo = await fresh();
    const partial = [];
    for (let i = 0; i < 6; i += 1) partial.push((await animal(partialRepo, { farmId: `P${i}` })).id);
    const partialValues = { [partial[0]]: '', [partial[1]]: '10', [partial[2]]: '', [partial[3]]: '11', [partial[4]]: '12', [partial[5]]: '13' };
    const stopped = await saveChuteWeights(partialRepo, partial, shared, partialValues, { stopAfter: 3 });
    assert.deepEqual(stopped.map((row) => row.animalId), [partial[1], partial[3], partial[4]]);
    assert.equal((await partialRepo.snapshot()).weights.length, 3);
    await assert.rejects(() => saveChuteWeights(partialRepo, [partial[0], partial[2], partial[5]], shared, {
      [partial[0]]: '100',
      [partial[2]]: '0',
      [partial[5]]: '77',
    }));
    const left = await partialRepo.snapshot();
    assert.equal(left.weights.filter((row) => row.animalId === partial[0] && row.value === 100).length, 1);
    assert.equal(left.weights.filter((row) => row.animalId === partial[2]).length, 0);
    assert.equal(left.weights.filter((row) => row.animalId === partial[5]).length, 0);
    partialRepo.close();
  } finally { repo.close(); }
});

test('a sale without the hold check writes nothing and keeps an earlier sale', async () => {
  const repo = await fresh();
  try {
    const first = await animal(repo, { farmId: 'Sold', sex: 'female' });
    const second = await animal(repo, { farmId: 'Kept', sex: 'female' });
    const shared = { date: '2026-10-01', destination: 'Buyer', amount: null, currency: null };
    await saveChuteSale(repo, first.id, shared, true);
    await assert.rejects(() => saveChuteSale(repo, second.id, shared, false), /departure/);
    const snap = await repo.snapshot();
    assert.equal(snap.movements.length, 1);
    assert.equal(snap.animals.find((row) => row.id === first.id).status, 'sold');
    assert.equal(snap.animals.find((row) => row.id === second.id).status, 'active');
    assert.equal(chuteSaleInput(second.id, shared, false).acknowledgeDeparture, false);
  } finally { repo.close(); }
});

async function screen() {
  const dom = new JSDOM('<main id="herd"></main>', { url: 'https://herd.test/#animals/chute' });
  Object.assign(globalThis, { document: dom.window.document, location: dom.window.location, localStorage: dom.window.localStorage });
  const repo = await openRepository({ factory: new IDBFactory() });
  const root = document.querySelector('main');
  const notices = [];
  const ui = new HerdUI(root, {
    repository: () => repo,
    message: (...note) => notices.push(note),
    refresh: async () => ui.render(await repo.snapshot(), location.hash.slice(1) || 'animals/chute'),
  });
  return { repo, root, ui, notices, close: () => { repo.close(); dom.window.close(); } };
}

test('group work starts from search and prechecks treat and move', async () => {
  const h = await screen();
  try {
    const first = await animal(h.repo, { farmId: 'Rosie', visualTag: '215', sex: 'female' });
    const second = await animal(h.repo, { farmId: 'Daisy', visualTag: '214', sex: 'female' });
    h.ui.render(await h.repo.snapshot(), 'animals/chute');
    assert.match(h.root.textContent, /Work a group/);
    assert.ok(h.root.querySelector('input[type="search"]'));
    h.ui.chuteIds = [first.id];
    h.ui.render(await h.repo.snapshot(), 'health/batch');
    assert.equal(h.root.querySelector(`[name="animal:${first.id}"]`).checked, true);
    assert.equal(h.root.querySelector(`[name="animal:${second.id}"]`).checked, false);
    assert.equal(h.ui.chuteIds, null);
    h.ui.chuteIds = [second.id];
    h.ui.render(await h.repo.snapshot(), 'animals/batch');
    assert.equal(h.root.querySelector(`[name="animal:${second.id}"]`).checked, true);
    assert.equal(h.root.querySelector(`[name="animal:${first.id}"]`).checked, false);
    assert.equal(h.ui.chuteIds, null);
    h.ui.chute = { ids: Array.from({ length: 23 }, (_, index) => `missing-${index}`), job: 'weigh', index: 2, shared: null, saved: 0 };
    h.ui.render(await h.repo.snapshot(), 'animals/chute');
    assert.match(h.root.textContent, /3 of 23/);
  } finally { h.close(); }
});

test('an empty weight is not a save and each sale needs its own check', async () => {
  const h = await screen();
  try {
    const first = await animal(h.repo, { farmId: 'Rosie', visualTag: '215', sex: 'female' });
    const second = await animal(h.repo, { farmId: 'Daisy', visualTag: '214', sex: 'female' });
    h.ui.chute = { ids: [first.id, second.id], job: 'weigh', index: 0, shared: { date: '2026-10-01', type: 'other', unit: 'lb' }, saved: 0 };
    h.ui.render(await h.repo.snapshot(), 'animals/chute');
    assert.match(h.root.textContent, /1 of 2/);
    const weigh = h.root.querySelector('[name="value"]').form;
    await weigh.onsubmit({ preventDefault() {} });
    assert.equal((await h.repo.snapshot()).weights.length, 0);
    assert.match(h.notices.at(-1)[0], /Next animal/);
    [...h.root.querySelectorAll('button')].find((button) => button.textContent === 'Next animal').click();
    assert.equal((await h.repo.snapshot()).weights.length, 0);
    assert.match(h.root.textContent, /2 of 2/);
    h.root.querySelector('[name="value"]').value = '450';
    await h.root.querySelector('[name="value"]').form.onsubmit({ preventDefault() {} });
    const weights = (await h.repo.snapshot()).weights;
    assert.equal(weights.length, 1);
    assert.equal(weights[0].animalId, second.id);
    assert.equal(weights[0].value, 450);
    h.ui.chute = { ids: [first.id], job: 'sell', index: 0, shared: { date: '2026-10-01', destination: 'Buyer', amount: null, currency: null }, saved: 0 };
    h.ui.render(await h.repo.snapshot(), 'animals/chute');
    const sale = h.root.querySelector('[name="acknowledgeDeparture"]').form;
    await sale.onsubmit({ preventDefault() {} });
    assert.equal((await h.repo.snapshot()).movements.length, 0);
    h.root.querySelector('[name="acknowledgeDeparture"]').checked = true;
    await h.root.querySelector('[name="acknowledgeDeparture"]').form.onsubmit({ preventDefault() {} });
    const done = await h.repo.snapshot();
    assert.equal(done.movements.length, 1);
    assert.equal(done.animals.find((row) => row.id === first.id).status, 'sold');
    assert.match(h.root.textContent, /Group work done/);
  } finally { h.close(); }
});
