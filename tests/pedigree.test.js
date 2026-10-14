// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pedigreeView } from '../app/lib/pedigree.js';

const source = readFileSync(new URL('../app/lib/pedigree.js', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const animal = (n, extra = {}) => ({ id: id(n), farmId: extra.farmId || `Animal ${n}`, visualTag: extra.visualTag || null, voidedAt: null, ...extra });

test('family view is three rows and links only real ids', () => {
  assert.doesNotMatch(source, /\.put\(|innerHTML/);
  const cow = animal(1, { farmId: 'Rosie', visualTag: '215', damReference: 'Outside cow' });
  const view = pedigreeView({ animals: [cow], calvings: [], weights: [] }, cow.id);
  assert.equal(view.rows.length, 3);
  assert.deepEqual(view.rows.map((row) => row.length), [1, 2, 4]);
  assert.equal(view.rows[0][0].name, 'Rosie');
  assert.equal(view.rows[0][0].href, `#animals/${cow.id}`);
  assert.equal(view.rows[1][0].name, 'Outside cow');
  assert.equal(view.rows[1][0].href, null);
  assert.equal(view.rows[1][0].external, true);
  assert.equal(view.rows[1][1].name, 'Not entered');
  assert.ok(view.rows[2].every((cell) => cell.name === 'Not entered' && cell.href === null));
  const loose = pedigreeView({ animals: [{ id: 'cow-1', farmId: 'X' }], calvings: [], weights: [] }, 'cow-1');
  assert.equal(loose.rows[0][0].href, null);
  assert.equal(loose.rows[0][0].name, 'X');
});

test('a family loop stops and does not walk that animal again', () => {
  const cow = animal(1, { farmId: 'Rosie', damId: id(1) });
  const view = pedigreeView({ animals: [cow], calvings: [], weights: [] }, cow.id);
  assert.equal(view.rows[1][0].name, 'Family link loops. Stopped.');
  assert.equal(view.rows[1][0].loop, true);
  assert.ok(view.rows[2].every((cell) => cell.name === 'Not entered'));
  const mom = animal(2, { farmId: 'Mom', damId: id(1) });
  const self = animal(1, { farmId: 'Rosie', damId: id(2) });
  const loop = pedigreeView({ animals: [self, mom], calvings: [], weights: [] }, self.id);
  assert.equal(loop.rows[1][0].name, 'Mom');
  assert.equal(loop.rows[2][0].name, 'Family link loops. Stopped.');
});

test('calves list twins, stillborn calves, weaning weights and unlinked offspring', () => {
  const cow = animal(1, { farmId: 'Rosie' });
  const live = animal(2, { farmId: 'Live', visualTag: '10', damId: cow.id });
  const dead = animal(3, { farmId: 'Dead', damId: cow.id });
  const loose = animal(4, { farmId: 'Loose', damId: cow.id });
  const birthId = id(9);
  const view = pedigreeView({
    animals: [cow, live, dead, loose],
    calvings: [{
      id: 'birth',
      damId: cow.id,
      voidedAt: null,
      calves: [
        { calfId: live.id, outcome: 'live', birthWeightId: birthId },
        { calfId: dead.id, outcome: 'stillborn', birthWeightId: null },
      ],
    }],
    weights: [
      { id: birthId, animalId: live.id, type: 'birth', value: 70, unit: 'lb', date: '2026-01-01', voidedAt: null },
      { id: id(8), animalId: live.id, type: 'weaning', value: 400, unit: 'lb', date: '2026-06-01', voidedAt: null },
      { id: id(7), animalId: live.id, type: 'weaning', value: 380, unit: 'lb', date: '2026-05-01', voidedAt: null },
      { id: id(6), animalId: live.id, type: 'other', value: 900, unit: 'lb', date: '2026-08-01', voidedAt: null },
      { id: id(5), animalId: live.id, type: 'weaning', value: 10, unit: 'lb', date: '2026-07-01', voidedAt: '2026-07-02' },
    ],
  }, cow.id);
  assert.equal(view.summary, 'Calves: 3, weaned: 1.');
  assert.equal(view.offspring.length, 3);
  const liveRow = view.offspring.find((calf) => calf.id === live.id);
  const deadRow = view.offspring.find((calf) => calf.id === dead.id);
  const looseRow = view.offspring.find((calf) => calf.id === loose.id);
  assert.equal(liveRow.twin, true);
  assert.equal(deadRow.twin, true);
  assert.equal(looseRow.twin, false);
  assert.match(liveRow.text, /Live, twin/);
  assert.match(liveRow.text, /Birth 70 lb/);
  assert.match(liveRow.text, /Weaning 400 lb/);
  assert.doesNotMatch(liveRow.text, /900/);
  assert.match(deadRow.text, /Stillborn, twin/);
  assert.match(deadRow.text, /Weaning Not entered/);
  assert.equal(looseRow.outcome, 'Outcome not entered');
  assert.equal(liveRow.href, `#animals/${live.id}`);
});
