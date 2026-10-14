// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { copyProblems } from '../app/lib/copy.js';
import {
  addMoney,
  pricePerPound,
  herdNumbers,
  calfSales,
  savedCopyLine,
  shelfReport,
} from '../app/lib/herd-stats.js';
import { PRINT_REPORTS, assembleReport, renderReport, PRINT_FOOTER } from '../app/lib/reports.js';
import { OwnershipUI } from '../app/lib/ownership-ui.js';

const source = readFileSync(new URL('../app/lib/herd-stats.js', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../app/lib/reports.js', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2026-10-13T15:00:00.000Z';
const animal = (n, extra = {}) => ({
  id: id(n),
  farmId: `C${n}`,
  visualTag: null,
  sex: 'female',
  status: 'active',
  voidedAt: null,
  currentGroupId: null,
  pasture: null,
  damId: null,
  sireId: null,
  damReference: null,
  sireReference: null,
  birthDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
function base(extra = {}) {
  return {
    operation: [{ name: 'Test Farm', timeZone: 'Etc/UTC', weightUnit: 'lb' }],
    metadata: [{ lastUserConfirmedBackupAt: null }],
    animals: [],
    identifiers: [],
    memberships: [],
    groups: [],
    calvings: [],
    weights: [],
    breedings: [],
    pregnancyChecks: [],
    movements: [],
    treatments: [],
    treatmentCourses: [],
    revisions: [],
    ...extra,
  };
}
const breeding = (extra) => ({ id: id(80), voidedAt: null, method: 'natural', serviceDate: null, exposureStart: null, exposureEnd: null, ...extra });
const check = (extra) => ({ id: id(90), voidedAt: null, result: 'open', method: 'palpation', date: '2026-05-01', ...extra });
const birth = (extra) => ({ id: id(70), voidedAt: null, birthDate: '2026-03-01', sireId: null, sireReference: null, calves: [], ...extra });
const sale = (extra) => ({ id: id(60), voidedAt: null, type: 'sale', date: '2026-06-01', amount: '10.00', currency: 'USD', weightValue: null, weightUnit: null, ...extra });

function rendered(snapshot, options) {
  const dom = new JSDOM('<article></article>');
  const root = dom.window.document.querySelector('article');
  const report = assembleReport(snapshot, { now, ...options });
  renderReport(root, report);
  const text = root.textContent;
  dom.window.close();
  return { report, text };
}

test('money stays decimal and rounds half up', () => {
  assert.doesNotMatch(source, /205|283|JSON\.stringify|parseFloat|innerHTML|\.put\(|fetch\(/);
  assert.doesNotMatch(reports, /JSON\.stringify/);
  assert.equal(addMoney(['0.10', '0.20']), '0.30');
  assert.equal(addMoney(['1.10', '2.20']), '3.30');
  assert.equal(addMoney(['12.5', '12.50']), '25.00');
  assert.equal(addMoney(['999999999999.99', '0.01']), '1000000000000.00');
  assert.equal(addMoney(['1.2.3']), null);
  assert.equal(addMoney(['-1.00']), null);
  assert.equal(pricePerPound('10.00', 3, 'lb'), '3.3333');
  assert.equal(pricePerPound('2.00', 3, 'lb'), '0.6667');
  assert.equal(pricePerPound('1.00', 8, 'lb'), '0.1250');
  assert.equal(pricePerPound('1.005', 1, 'lb'), '1.0050');
  assert.equal(pricePerPound('1.00005', 1, 'lb'), '1.0001');
  assert.equal(pricePerPound('220.46', 100, 'kg'), '1.0000');
  assert.equal(pricePerPound('10.00', null, 'lb'), null);
  assert.equal(pricePerPound('10.00', 0, 'lb'), null);
});

test('herd numbers count twins, sold cows, unknown dates and no age adjustment', () => {
  const cows = [
    animal(1, { farmId: 'Rosie' }),
    animal(2, { farmId: 'Sold', status: 'sold' }),
    animal(3, { farmId: 'Open' }),
    animal(4, { farmId: 'Bull', sex: 'male' }),
    animal(5, { farmId: 'Void', voidedAt: '2026-01-01T00:00:00.000Z' }),
    animal(6, { farmId: 'Later' }),
  ];
  const snapshot = base({
    animals: cows,
    breedings: [
      breeding({ id: id(11), damId: id(1), serviceDate: '2026-01-10' }),
      breeding({ id: id(12), damId: id(2), exposureStart: '2026-01-01', exposureEnd: '2026-02-01' }),
      breeding({ id: id(13), damId: id(3), serviceDate: null, exposureStart: null }),
      breeding({ id: id(14), damId: id(4), serviceDate: '2026-01-10' }),
      breeding({ id: id(15), damId: id(5), serviceDate: '2026-01-10' }),
      breeding({ id: id(16), damId: id(6), serviceDate: '2025-06-01' }),
      breeding({ id: id(17), damId: id(1), voidedAt: '2026-02-01T00:00:00.000Z', serviceDate: '2026-01-01' }),
    ],
    calvings: [
      birth({ id: id(21), damId: id(1), birthDate: '2026-03-01', calves: [{ calfId: id(31), outcome: 'live' }, { calfId: id(32), outcome: 'stillborn' }] }),
      birth({ id: id(22), damId: id(2), birthDate: '2026-03-15', calves: [{ calfId: id(33), outcome: 'live' }] }),
      birth({ id: id(23), damId: id(6), birthDate: '2026-04-01', calves: [{ calfId: id(34), outcome: 'unknown' }] }),
      birth({ id: id(24), damId: id(1), birthDate: '2025-03-01', calves: [{ calfId: id(35), outcome: 'live' }] }),
      birth({ id: id(25), damId: id(2), birthDate: '2024-03-10', calves: [{ calfId: id(36), outcome: 'died-after-birth' }] }),
    ],
    pregnancyChecks: [
      check({ id: id(41), animalId: id(1), date: '2026-02-01', result: 'pregnant' }),
      check({ id: id(42), animalId: id(1), date: '2026-02-02', result: 'open' }),
      check({ id: id(43), animalId: id(2), date: '2026-02-01', result: 'pregnant' }),
      check({ id: id(44), animalId: id(3), date: '2026-02-01', result: 'uncertain' }),
      check({ id: id(45), animalId: id(3), date: '2026-01-01', result: 'pregnant', voidedAt: '2026-02-01T00:00:00.000Z' }),
      check({ id: id(46), animalId: id(6), date: '2025-01-01', result: 'pregnant' }),
    ],
    weights: [
      { id: id(51), animalId: id(31), date: '2026-09-01', type: 'weaning', value: 500, unit: 'lb', voidedAt: null },
      { id: id(52), animalId: id(33), date: '2026-09-02', type: 'weaning', value: 100, unit: 'kg', voidedAt: null },
      { id: id(53), animalId: id(32), date: '2026-09-02', type: 'birth', value: 70, unit: 'lb', voidedAt: null },
      { id: id(54), animalId: id(34), date: '2026-09-03', type: 'weaning', value: 400, unit: 'lb', voidedAt: '2026-09-04T00:00:00.000Z' },
    ],
    animals: [
      ...cows,
      animal(31, { farmId: 'Twin', sex: 'female', status: 'active' }),
      animal(32, { farmId: 'Still', sex: 'female', status: 'dead' }),
      animal(33, { farmId: 'Buyer', sex: 'steer', status: 'sold' }),
      animal(34, { farmId: 'Late', sex: 'male', status: 'active' }),
      animal(35, { farmId: 'Old', sex: 'female', status: 'sold' }),
      animal(36, { farmId: 'Lost', sex: 'male', status: 'dead' }),
    ],
  });
  const stats = herdNumbers(snapshot, { from: '2026-01-01', to: '2026-12-31', unit: 'lb' });
  assert.equal(stats.window, '2026-01-01 to 2026-12-31');
  assert.equal(stats.counts.exposed, 2);
  assert.equal(stats.counts.calvedOfExposed, 2);
  assert.equal(stats.counts.otherCalved, 1);
  assert.equal(stats.counts.pregnant, 1);
  assert.equal(stats.counts.checked, 3);
  const span = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  const gaps = [span('2025-03-01', '2026-03-01'), span('2024-03-10', '2026-03-15')];
  assert.equal(stats.counts.gaps, 2);
  assert.equal(stats.counts.averageDays, Math.round(gaps.reduce((sum, days) => sum + days, 0) / gaps.length));
  assert.equal(stats.counts.calves, 4);
  assert.equal(stats.counts.cows, 3);
  assert.equal(stats.counts.live, 2);
  assert.equal(stats.counts.weaningCount, 2);
  assert.equal(stats.counts.weaningAverage, '360.23');
  assert.match(stats.lines.at(-1), /No age adjustment/);
  assert.doesNotMatch(stats.lines.join(' '), /205|benchmark|target/);
  for (const line of stats.lines) assert.deepEqual(copyProblems(line), [], line);

  const all = herdNumbers(snapshot);
  assert.equal(all.window, 'All saved dates');
  assert.equal(all.counts.exposed, 4);
  const outside = herdNumbers(snapshot, { from: '2027-01-01', to: '2027-02-01' });
  assert.equal(outside.counts.exposed, 0);
  assert.equal(outside.counts.calves, 0);
  assert.match(outside.lines[0], /No breeding or calving/);
});

test('calf sales sum decimal amounts, keep currencies apart and skip missing weights', () => {
  const snapshot = base({
    animals: [
      animal(1, { farmId: 'Rosie' }),
      animal(2, { farmId: 'Twin A' }),
      animal(3, { farmId: 'Twin B' }),
      animal(4, { farmId: 'Other' }),
    ],
    calvings: [
      birth({ damId: id(1), calves: [{ calfId: id(2), outcome: 'live' }, { calfId: id(3), outcome: 'live' }] }),
    ],
    movements: [
      sale({ id: id(61), animalId: id(2), amount: '10.00', currency: 'USD', weightValue: 3, weightUnit: 'lb' }),
      sale({ id: id(62), animalId: id(3), amount: '20.00', currency: 'USD', weightValue: 100, weightUnit: 'kg' }),
      sale({ id: id(63), animalId: id(2), amount: '4.00', currency: 'CAD', weightValue: null }),
      sale({ id: id(64), animalId: id(1), amount: '999.00', currency: 'USD', weightValue: 1000, weightUnit: 'lb' }),
      sale({ id: id(65), animalId: id(3), amount: '8.00', currency: 'USD', voidedAt: '2026-07-01T00:00:00.000Z' }),
      sale({ id: id(66), animalId: id(4), amount: '50.00', currency: 'USD' }),
      { ...sale({ id: id(67), animalId: id(2), amount: '5.00', currency: 'USD' }), type: 'purchase' },
      sale({ id: id(68), animalId: id(3), amount: '1.00', currency: 'usd' }),
      sale({ id: id(69), animalId: id(2), date: '2025-01-01', amount: '7.00', currency: 'USD' }),
    ],
  });
  const sales = calfSales(snapshot, { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(sales.byCow.length, 1);
  assert.equal(sales.byCow[0].currencies.USD.total, '30.00');
  assert.equal(sales.byCow[0].currencies.CAD.total, '4.00');
  assert.equal(sales.byCow[0].currencies.USD.sales[0].pricePerPound, '3.3333');
  assert.equal(sales.byCow[0].currencies.USD.sales[1].pricePerPound, '0.0907');
  assert.equal(sales.byCow[0].currencies.CAD.sales[0].pricePerPound, null);
  assert.match(sales.lines.join('\n'), /Weight not entered/);
  assert.match(sales.lines.join('\n'), /Price not entered/);
  assert.match(sales.lines.join('\n'), /Each currency stays apart/);
  assert.doesNotMatch(JSON.stringify(sales.byCow), /"total":"34/);
  assert.doesNotMatch(sales.lines.join('\n'), /999\.00/);
  const one = calfSales(snapshot, { damId: id(1), from: '2026-01-01', to: '2026-12-31' });
  assert.equal(one.byCow[0].currencies.USD.total, '30.00');
});

test('saved copy uses the farm calendar day and skips voided animals', () => {
  const snapshot = base({
    animals: [animal(1), animal(2, { voidedAt: '2026-01-01T00:00:00.000Z' })],
    operation: [{ name: 'Test Farm', timeZone: 'America/Chicago', weightUnit: 'lb' }],
    metadata: [{ lastUserConfirmedBackupAt: '2026-10-13T03:00:00.000Z' }],
  });
  assert.equal(savedCopyLine(snapshot), 'Saved copy: Herd backup 2026-10-12.json, 1 animal.');
  snapshot.metadata[0].lastUserConfirmedBackupAt = null;
  assert.equal(savedCopyLine(snapshot), 'No saved copy on this phone yet.');
  assert.deepEqual(copyProblems('No saved copy on this phone yet.'), []);
});

test('print shelf lists open cows, culls, holds, blanks and due cows without raw codes', () => {
  const group = id(9);
  const snapshot = base({
    groups: [{ id: group, name: 'North', voidedAt: null }],
    animals: [
      animal(1, { farmId: 'Rosie', visualTag: '12', sex: 'female', birthDate: '2020-01-01', currentGroupId: group }),
      animal(2, { farmId: 'Open Cow', sex: 'female' }),
      animal(3, { farmId: 'Bull', sex: 'male' }),
      animal(4, { farmId: 'Cull Me', sex: 'female' }),
      animal(5, { farmId: 'Gone', sex: 'female', status: 'sold' }),
      animal(6, { farmId: 'Calf', sex: 'female', damId: id(1) }),
    ],
    pregnancyChecks: [
      check({ id: id(41), animalId: id(2), date: '2026-01-01', result: 'pregnant' }),
      check({ id: id(42), animalId: id(2), date: '2026-04-01', result: 'open' }),
      check({ id: id(43), animalId: id(3), date: '2026-04-02', result: 'open' }),
      check({ id: id(44), animalId: id(1), date: '2026-05-01', result: 'pregnant', expectedCalvingDate: '2026-10-20' }),
      check({ id: id(45), animalId: id(4), date: '2026-04-01', result: 'open', voidedAt: '2026-04-02T00:00:00.000Z' }),
    ],
    movements: [
      { id: id(71), animalId: id(4), type: 'cull-decision', date: '2026-02-01', reason: 'Age', voidedAt: null },
      { id: id(72), animalId: id(4), type: 'cull-decision', date: '2026-03-01', reason: 'Feet', voidedAt: null },
      { id: id(73), animalId: id(5), type: 'cull-decision', date: '2026-03-01', reason: 'Sold later', voidedAt: null },
      { id: id(74), animalId: id(1), type: 'cull-decision', date: '2026-01-01', reason: 'Wrong', voidedAt: '2026-01-02T00:00:00.000Z' },
    ],
    calvings: [birth({ damId: id(1), calves: [{ calfId: id(6), outcome: 'stillborn' }] })],
  });
  const open = shelfReport(snapshot, { type: 'open-cows', now });
  assert.deepEqual(open.rows.map((row) => row.cells[0]), ['Bull', 'Open Cow']);
  assert.match(open.rows[1].cells[1], /2026-04-01\. Open\./);
  const cull = shelfReport(snapshot, { type: 'cull-list', now });
  assert.equal(cull.rows.length, 1);
  assert.equal(cull.rows[0].cells[0], 'Cull Me');
  assert.equal(cull.rows[0].cells[1], '2026-03-01');
  assert.equal(cull.rows[0].cells[2], 'Feet');
  const book = shelfReport(snapshot, { type: 'herd-book', now, groupId: group });
  assert.equal(book.rows.length, 1);
  assert.match(book.rows[0].cells[1], /Female/);
  assert.match(book.rows[0].cells[3], /Mother Not entered/);
  const due = shelfReport(snapshot, { type: 'expected-calving', now });
  assert.match(due.rows.map((row) => row.cells.join(' ')).join('\n'), /Rosie/);
  assert.doesNotMatch(due.rows.map((row) => row.cells.join(' ')).join('\n'), /Open Cow/);
  for (const type of ['blank-chute', 'blank-calving']) {
    const sheet = shelfReport(snapshot, { type, now });
    assert.equal(sheet.rows.length, 12);
    assert.ok(sheet.rows.every((line) => line.cells.every((cell) => cell === '')));
    assert.equal(sheet.skipSafety, true);
  }
  const holds = shelfReport(snapshot, { type: 'barn-holds', now });
  assert.match(holds.legend, /Recorded interval elapsed is not permission for slaughter or milk sale/);
  assert.equal(holds.rows.length, 0);
  for (const type of ['herd-book', 'open-cows', 'expected-calving', 'cull-list', 'barn-holds', 'blank-chute', 'blank-calving', 'herd-numbers', 'sales']) {
    const { text } = rendered(snapshot, { type });
    assert.doesNotMatch(text, /\{|\bUTC\b/, type);
    assert.doesNotMatch(text, /\b(cull-decision|died-after-birth|other-departure|not-applicable|needs-review|manual-review)\b/, type);
    assert.doesNotMatch(text, /Sex: female|Outcome: stillborn|Status: active/, type);
    assert.match(text, /No saved copy on this phone yet/, type);
  }
});

test('existing reports stay plain, keep the terms footer, and show calf sales on the dam card', () => {
  const snapshot = base({
    animals: [
      animal(1, { farmId: 'Rosie', sex: 'female', timeZone: 'Etc/UTC' }),
      animal(2, { farmId: 'Calf', sex: 'female' }),
    ],
    calvings: [birth({ damId: id(1), calves: [{ calfId: id(2), outcome: 'stillborn', birthWeightId: null }] })],
    weights: [
      { id: id(51), animalId: id(1), date: '2026-01-01', type: 'other', value: 900, unit: 'lb', voidedAt: null },
      { id: id(52), animalId: id(1), date: '2026-06-01', type: 'other', value: 1000, unit: 'lb', voidedAt: null },
    ],
    movements: [sale({ animalId: id(2), amount: '10.00', currency: 'USD', weightValue: 3, weightUnit: 'lb' })],
  });
  const calving = rendered(snapshot, { type: 'calvings' });
  assert.match(calving.text, /Female/);
  assert.match(calving.text, /Stillborn/);
  assert.doesNotMatch(calving.text, /Sex: female|Outcome: stillborn|\{|\bUTC\b/);
  assert.equal(calving.report.rows.length, 1);
  const card = rendered(snapshot, { type: 'animal', animalId: id(1) });
  assert.match(card.text, /USD 10\.00/);
  assert.match(card.text, /3\.3333 per pound/);
  assert.match(card.text, /Weight line|Not enough data|2026-01-01/);
  assert.doesNotMatch(card.text, /\{|\bUTC\b/);
  assert.equal(card.text.includes(PRINT_FOOTER), true);
  const dom = new JSDOM('<article></article>');
  const root = dom.window.document.querySelector('article');
  renderReport(root, assembleReport(snapshot, { type: 'treatments', now }));
  assert.equal(root.querySelector('.report-print-footer p:last-child').textContent, PRINT_FOOTER);
  assert.match(root.textContent, /No saved copy on this phone yet/);
  dom.window.close();
});

test('sample barn sheet names elapsed holds and never calls them safe', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-herd.json', import.meta.url), 'utf8')).stores;
  const { text } = rendered(fixture, { type: 'barn-holds' });
  assert.match(text, /Recorded interval elapsed is not permission for slaughter or milk sale/);
  assert.match(text, /Recorded interval elapsed/);
  assert.doesNotMatch(text, /\{|\bUTC\b/);
  assert.doesNotMatch(text, /safe to slaughter|safe for slaughter|cleared for slaughter/);
  for (const [type] of PRINT_REPORTS) {
    const view = rendered(fixture, { type, animalId: fixture.animals[0].id });
    assert.doesNotMatch(view.text, /\{|\bUTC\b/, type);
  }
});

test('reports screen keeps the old print button and adds the new list', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-herd.json', import.meta.url), 'utf8')).stores;
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main');
  const ui = new OwnershipUI(root, {
    repository: () => ({ snapshot: async () => fixture }),
    refresh: async () => {},
    message: () => {},
    advancedRestore: async () => {},
  });
  ui.render(fixture);
  assert.ok(root.querySelector('#report-print-area table'));
  assert.ok(root.querySelector('select'));
  assert.match(root.querySelector('#herd-numbers').textContent, /Herd numbers/);
  assert.match(root.querySelector('#herd-numbers').textContent, /No age adjustment/);
  const print = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Print / Save as PDF');
  assert.ok(print);
  const book = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Herd book');
  assert.ok(book.querySelector('svg'));
  await book.onclick();
  assert.match(root.querySelector('#report-print-area h2').textContent, /Herd book/);
  dom.window.close();
});
