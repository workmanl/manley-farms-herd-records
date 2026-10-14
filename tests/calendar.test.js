// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { dueRows, dueThisMonth, expectedFromDays } from '../app/lib/calendar.js';
import { openRepository } from '../app/lib/database.js';
import { commitWorkflow } from '../app/lib/workflows.js';
import { HerdUI } from '../app/lib/herd-ui.js';
import { copyProblems } from '../app/lib/copy.js';

const source = readFileSync(new URL('../app/lib/calendar.js', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const animal = (partial) => ({ sex: 'female', status: 'active', voidedAt: null, visualTag: null, ...partial });
const snap = (animals, extra = {}) => ({
  animals,
  pregnancyChecks: extra.pregnancyChecks || [],
  breedings: extra.breedings || [],
  calvings: extra.calvings || [],
});
const check = (partial) => ({ id: 'c1', voidedAt: null, result: 'pregnant', method: 'palpation', ...partial });
const breeding = (partial) => ({ id: 'b1', voidedAt: null, method: 'AI', ...partial });

test('due dates use only a saved date or days the farmer types', () => {
  assert.doesNotMatch(source, /283/);
  assert.doesNotMatch(source, /gestationDays\s*=\s*\d+/);
  assert.equal(expectedFromDays('2026-10-01', '12', null), '2026-10-13');
  assert.equal(expectedFromDays('2026-10-01', '12', '2027-01-01'), '2027-01-01');
  assert.equal(expectedFromDays('2026-10-01', '', null), null);
  assert.equal(expectedFromDays('2026-10-01', null, null), null);
  assert.equal(expectedFromDays('2026-10-01', '1.5', null), null);
  assert.equal(expectedFromDays('2026-10-01', '-3', null), null);
  assert.equal(expectedFromDays('yesterday', '12', null), null);
});

test('due list covers dated, missing, open, uncertain, voided, repeated and calved cows', () => {
  const rosie = animal({ id: id(1), farmId: 'Rosie', visualTag: '215' });
  const open = animal({ id: id(2), farmId: 'Open Cow' });
  const unsure = animal({ id: id(3), farmId: 'Unsure' });
  const missing = animal({ id: id(4), farmId: 'No Date' });
  const bred = animal({ id: id(5), farmId: 'Just Bred' });
  const calved = animal({ id: id(6), farmId: 'Already Calved' });
  const sold = animal({ id: id(7), farmId: 'Sold Cow', status: 'sold' });
  const steer = animal({ id: id(8), farmId: 'Steer', sex: 'steer' });
  const bull = animal({ id: id(9), farmId: 'Bull', sex: 'male' });
  const stale = animal({ id: id(10), farmId: 'Bred Again' });
  const today = '2026-10-01';
  const rows = dueRows(snap(
    [rosie, open, unsure, missing, bred, calved, sold, steer, bull, stale],
    {
      pregnancyChecks: [
        check({ id: 'old', animalId: rosie.id, date: '2026-08-01', expectedCalvingDate: '2026-09-01' }),
        check({ animalId: rosie.id, date: '2026-09-01', expectedCalvingDate: '2026-10-13' }),
        check({ id: 'void', animalId: open.id, date: '2026-09-01', expectedCalvingDate: '2026-10-13', voidedAt: '2026-09-02' }),
        check({ id: 'open', animalId: open.id, date: '2026-09-02', result: 'open', expectedCalvingDate: null }),
        check({ id: 'unsure', animalId: unsure.id, date: '2026-09-01', result: 'uncertain', expectedCalvingDate: null }),
        check({ id: 'miss', animalId: missing.id, date: '2026-09-01', expectedCalvingDate: null, estimatedGestationDays: 40 }),
        check({ id: 'calved', animalId: calved.id, date: '2026-01-01', expectedCalvingDate: '2026-10-01' }),
        check({ id: 'sold', animalId: sold.id, date: '2026-09-01', expectedCalvingDate: '2026-10-20' }),
        check({ id: 'steer', animalId: steer.id, date: '2026-09-01', expectedCalvingDate: '2026-10-20' }),
        check({ id: 'stale', animalId: stale.id, date: '2026-08-01', expectedCalvingDate: '2026-10-20' }),
      ],
      breedings: [
        breeding({ damId: bred.id, serviceDate: '2026-09-20' }),
        breeding({ id: 'later', damId: stale.id, serviceDate: '2026-09-15' }),
        breeding({ id: 'before', damId: rosie.id, serviceDate: '2026-08-15' }),
      ],
      calvings: [{ id: 'birth', damId: calved.id, birthDate: '2026-09-15', voidedAt: null }],
    },
  ), today);
  const byName = Object.fromEntries(rows.map((row) => [row.label, row]));
  assert.equal(byName['Rosie 215'].text, 'Rosie 215: calf due in 12 days.');
  assert.equal(byName['Rosie 215'].kind, 'due');
  assert.equal(byName['Rosie 215'].href, `#animals/${rosie.id}`);
  assert.equal(byName.Unsure.text, 'Unsure: Not sure yet.');
  assert.equal(byName['No Date'].text, 'No Date: Due date not entered.');
  assert.equal(byName['Just Bred'].text, 'Just Bred: Bred, no pregnancy check yet.');
  assert.equal(byName['Just Bred'].date, null);
  assert.equal(byName['Bred Again'].kind, 'bred');
  assert.equal(byName['Open Cow'], undefined);
  assert.equal(byName['Already Calved'], undefined);
  assert.equal(byName['Sold Cow'], undefined);
  assert.equal(byName.Steer, undefined);
  assert.equal(byName.Bull, undefined);
  assert.deepEqual(rows.map((row) => row.kind), ['due', 'missing', 'uncertain', 'bred', 'bred']);
  for (const row of rows) assert.deepEqual(copyProblems(row.text), [], row.text);
});

test('countdown sentences and this month include overdue dates only', () => {
  const cow = animal({ id: id(1), farmId: 'Rosie', visualTag: '215' });
  const sentence = (due, today) => dueRows(snap([cow], {
    pregnancyChecks: [check({ animalId: cow.id, date: '2026-01-01', expectedCalvingDate: due })],
  }), today)[0].text;
  assert.equal(sentence('2026-10-02', '2026-10-01'), 'Rosie 215: calf due in 1 day.');
  assert.equal(sentence('2026-10-01', '2026-10-01'), 'Rosie 215: calf due today.');
  assert.equal(sentence('2026-09-30', '2026-10-01'), 'Rosie 215: calf was due 1 day ago.');
  assert.equal(sentence('2026-09-26', '2026-10-01'), 'Rosie 215: calf was due 5 days ago.');
  const monthCow = (n, due) => animal({ id: id(n), farmId: `Cow ${n}` });
  const cows = [monthCow(2), monthCow(3), monthCow(4)];
  const rows = dueRows(snap(cows, {
    pregnancyChecks: [
      check({ id: 'soon', animalId: cows[0].id, date: '2026-09-01', expectedCalvingDate: '2026-10-20' }),
      check({ id: 'late', animalId: cows[1].id, date: '2026-09-01', expectedCalvingDate: '2026-11-02' }),
      check({ id: 'over', animalId: cows[2].id, date: '2026-08-01', expectedCalvingDate: '2026-09-01' }),
    ],
  }), '2026-10-13');
  assert.deepEqual(dueThisMonth(rows, '2026-10-13').map((row) => row.date), ['2026-09-01', '2026-10-20']);
});

test('a later calving is ignored when it is before the check, and the latest check wins on a tie', () => {
  const cow = animal({ id: id(1), farmId: 'Rosie', visualTag: '215' });
  const kept = dueRows(snap([cow], {
    pregnancyChecks: [check({ animalId: cow.id, date: '2026-09-01', expectedCalvingDate: '2026-10-13' })],
    calvings: [{ damId: cow.id, birthDate: '2026-08-01', voidedAt: null }],
  }), '2026-10-01');
  assert.equal(kept[0].kind, 'due');
  const tie = dueRows(snap([cow], {
    pregnancyChecks: [
      check({ id: 'a', animalId: cow.id, date: '2026-09-01', result: 'open' }),
      check({ id: 'b', animalId: cow.id, date: '2026-09-01', expectedCalvingDate: '2026-10-13' }),
    ],
  }), '2026-10-01');
  assert.equal(tie[0].kind, 'due');
});

async function ui() {
  const dom = new JSDOM('<main id="herd"></main>', { url: 'https://herd.test/#dashboard' });
  Object.assign(globalThis, { document: dom.window.document, location: dom.window.location, localStorage: dom.window.localStorage });
  const repo = await openRepository({ factory: new IDBFactory() });
  const root = document.querySelector('main');
  const ui = new HerdUI(root, {
    repository: () => repo,
    message: () => {},
    refresh: async () => ui.render(await repo.snapshot(), location.hash.slice(1) || 'dashboard'),
  });
  return { repo, root, ui, close: () => { repo.close(); dom.window.close(); } };
}

test('the pregnancy form stores days until as a due date and never stores the question', async () => {
  const h = await ui();
  try {
    const cow = await commitWorkflow(h.repo, await h.repo.snapshot(), 'animal', { farmId: 'Rosie', visualTag: '215', sex: 'female' });
    const save = async (fields) => {
      h.ui.render(await h.repo.snapshot(), `animals/${cow.id}/pregnancy`);
      const seen = new Set((await h.repo.snapshot()).pregnancyChecks.map((row) => row.id));
      for (const [name, value] of Object.entries(fields)) h.root.querySelector(`[name="${name}"]`).value = value;
      const form = h.root.querySelector('form');
      await form.onsubmit({ preventDefault() {}, submitter: form.querySelector('button[type="submit"]') });
      const added = (await h.repo.snapshot()).pregnancyChecks.filter((row) => !seen.has(row.id));
      assert.equal(added.length, 1);
      return added[0];
    };
    const dated = await save({ result: 'pregnant', date: '2026-10-01', daysUntilCalving: '12' });
    assert.equal(dated.expectedCalvingDate, '2026-10-13');
    assert.equal(dated.estimatedGestationDays, null);
    assert.equal(Object.hasOwn(dated, 'daysUntilCalving'), false);
    h.ui.render(await h.repo.snapshot(), 'animals/due');
    assert.match(h.root.textContent, /Rosie 215: calf (due|was due)/);
    assert.match(h.root.textContent, /Due this month/);
    h.ui.render(await h.repo.snapshot(), 'dashboard');
    assert.match(h.root.textContent, /Due soon/);
    assert.match(h.root.textContent, /Rosie 215: calf (due|was due)/);
    const kept = await save({ result: 'pregnant', date: '2026-10-01', daysUntilCalving: '12', expectedCalvingDate: '2027-01-01' });
    assert.equal(kept.expectedCalvingDate, '2027-01-01');
    const open = await save({ result: 'open', date: '2026-10-01', daysUntilCalving: '12' });
    assert.equal(open.expectedCalvingDate, null);
    const daysOnly = await save({ result: 'pregnant', date: '2026-10-01', estimatedGestationDays: '40' });
    assert.equal(daysOnly.expectedCalvingDate, null);
    assert.equal(daysOnly.estimatedGestationDays, 40);
  } finally { h.close(); }
});
