// SPDX-License-Identifier: AGPL-3.0-only
// Herd counts and calf sale totals from saved records. Nothing here is stored.
// No age-adjusted weights. No assumed gestation length.
// Money uses decimal strings. 1 lb = 0.45359237 kg, the same factor as the weight line.

import { dueRows } from './calendar.js';
import { plainOption } from './copy.js';
import { evaluateWithdrawal, localParts } from './withdrawal.js';

const LB_NUM = 45359237n;
const LB_DEN = 100000000n;
const WEIGHT_SCALE = 8;
const BLANK_LINES = 12;

const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;
const CURRENCY = /^[A-Z]{3}$/;

export function parseDecimal(text) {
  if (typeof text !== 'string' || !DECIMAL.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  return { digits: BigInt(whole + frac), scale: frac.length };
}

function formatScaled(digits, scale) {
  const neg = digits < 0n;
  const body = (neg ? -digits : digits).toString().padStart(scale + 1, '0');
  const whole = scale ? body.slice(0, body.length - scale) : body;
  const frac = scale ? body.slice(body.length - scale) : '';
  const text = scale ? `${whole}.${frac}` : whole;
  return neg && digits !== 0n ? `-${text}` : text;
}

// Divide and round half up. numer and denom are big integers.
function divideRound(numer, denom, places) {
  if (denom === 0n) return null;
  const neg = (numer < 0n) !== (denom < 0n);
  const n = numer < 0n ? -numer : numer;
  const d = denom < 0n ? -denom : denom;
  const scaled = n * 10n ** BigInt(places + 1) / d;
  const guard = scaled % 10n;
  let body = scaled / 10n;
  if (guard >= 5n) body += 1n;
  return formatScaled(neg ? -body : body, places);
}

function weightParts(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    if (Number.isInteger(value)) return { digits: BigInt(value), scale: 0 };
    const text = value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    const parsed = parseDecimal(text);
    return parsed ? { digits: parsed.digits, scale: parsed.scale } : null;
  }
  if (typeof value === 'string') return parseDecimal(value);
  return null;
}

function toScaled(parts, from, target) {
  if (!parts || parts.scale > WEIGHT_SCALE) return null;
  const base = parts.digits * 10n ** BigInt(WEIGHT_SCALE - parts.scale);
  if (from === target) return base;
  if (from === 'lb' && target === 'kg') return base * LB_NUM / LB_DEN;
  if (from === 'kg' && target === 'lb') return base * LB_DEN / LB_NUM;
  return null;
}

export function addMoney(values) {
  let acc = null;
  for (const value of values) {
    const parsed = parseDecimal(value);
    if (!parsed) return null;
    if (!acc) acc = { digits: parsed.digits, scale: parsed.scale };
    else {
      const scale = Math.max(acc.scale, parsed.scale);
      acc = {
        digits: acc.digits * 10n ** BigInt(scale - acc.scale) + parsed.digits * 10n ** BigInt(scale - parsed.scale),
        scale,
      };
    }
  }
  if (!acc) return null;
  if (acc.scale < 2) acc = { digits: acc.digits * 10n ** BigInt(2 - acc.scale), scale: 2 };
  return formatScaled(acc.digits, acc.scale);
}

export function pricePerPound(amount, weightValue, weightUnit) {
  const money = parseDecimal(amount);
  const pounds = toScaled(weightParts(weightValue), weightUnit, 'lb');
  if (!money || !pounds) return null;
  return divideRound(money.digits * 10n ** BigInt(WEIGHT_SCALE), pounds * 10n ** BigInt(money.scale), 4);
}

function averageWeight(values, places = 2) {
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0n);
  return divideRound(sum, BigInt(values.length) * 10n ** BigInt(WEIGHT_SCALE), places);
}

export function windowLabel(from = '', to = '') {
  if (!from && !to) return 'All saved dates';
  if (from && to) return `${from} to ${to}`;
  if (from) return `${from} and after`;
  return `Through ${to}`;
}

function inWindow(date, from, to) {
  if (!date) return !from && !to;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function breedingSpan(row) {
  if (row.serviceDate) return [row.serviceDate, row.serviceDate];
  if (row.exposureStart) return [row.exposureStart, row.exposureEnd || '9999-12-31'];
  return null;
}

function overlaps(span, from, to) {
  if (!span) return !from && !to;
  const [start, end] = span;
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}

function byId(snapshot) {
  return new Map((snapshot.animals || []).map((animal) => [animal.id, animal]));
}

function cowWord(count) {
  return count === 1 ? 'cow' : 'cows';
}

function groupName(snapshot, groupId) {
  if (!groupId) return '';
  return snapshot.groups?.find((group) => group.id === groupId)?.name || '';
}

function inGroup(animal, groupId) {
  return !groupId || animal?.currentGroupId === groupId;
}

function labelOf(animal) {
  if (!animal) return 'Unknown';
  if (animal.visualTag && animal.visualTag !== animal.farmId) return `${animal.farmId} tag ${animal.visualTag}`;
  return animal.farmId || 'Unknown';
}

function parentText(snapshot, animal, role) {
  const idKey = role === 'dam' ? 'damId' : 'sireId';
  const refKey = role === 'dam' ? 'damReference' : 'sireReference';
  const linked = animal[idKey] ? snapshot.animals.find((row) => row.id === animal[idKey]) : null;
  if (linked) return linked.farmId;
  if (animal[refKey]) return animal[refKey];
  return 'Not entered';
}

function farmDay(now, zone) {
  try {
    const day = localParts(now, zone).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  } catch {
    // A bad clock falls through to the date written on the stamp.
  }
  const text = String(now || '');
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

export function savedCopyLine(snapshot) {
  const count = (snapshot.animals || []).filter((animal) => !animal.voidedAt).length;
  const stamp = snapshot.metadata?.[0]?.lastUserConfirmedBackupAt;
  if (!stamp) return 'No saved copy on this phone yet.';
  const day = farmDay(stamp, snapshot.operation?.[0]?.timeZone || 'Etc/UTC');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'No saved copy on this phone yet.';
  return `Saved copy: Herd backup ${day}.json, ${count} ${count === 1 ? 'animal' : 'animals'}.`;
}

export function herdNumbers(snapshot, { from = '', to = '', unit, groupId = '' } = {}) {
  const animals = byId(snapshot);
  const displayUnit = unit || snapshot.operation?.[0]?.weightUnit || 'lb';
  const females = (id) => {
    const animal = animals.get(id);
    return animal && !animal.voidedAt && animal.sex === 'female' && inGroup(animal, groupId) ? animal : null;
  };
  const exposed = new Set();
  for (const row of snapshot.breedings || []) {
    if (row.voidedAt || !females(row.damId) || !overlaps(breedingSpan(row), from, to)) continue;
    exposed.add(row.damId);
  }
  const calved = new Set();
  for (const row of snapshot.calvings || []) {
    if (row.voidedAt || !inWindow(row.birthDate, from, to) || !females(row.damId)) continue;
    calved.add(row.damId);
  }
  const both = [...calved].filter((id) => exposed.has(id)).length;
  const other = calved.size - both;
  let calvingText = 'No breeding or calving records in these dates.';
  if (exposed.size && other) calvingText = `${both} of ${exposed.size} ${cowWord(exposed.size)} with a breeding record calved. ${other} other ${cowWord(other)} calved in these dates.`;
  else if (exposed.size) calvingText = `${both} of ${exposed.size} ${cowWord(exposed.size)} with a breeding record calved.`;
  else if (calved.size) calvingText = `${calved.size} ${cowWord(calved.size)} calved. No breeding record in these dates.`;

  const checks = new Map();
  for (const row of snapshot.pregnancyChecks || []) {
    if (row.voidedAt || !inWindow(row.date, from, to) || !females(row.animalId)) continue;
    const prev = checks.get(row.animalId);
    if (!prev || row.date > prev.date || (row.date === prev.date && row.id > prev.id)) checks.set(row.animalId, row);
  }
  const pregnant = [...checks.values()].filter((row) => row.result === 'pregnant').length;
  const pregnancyText = checks.size
    ? `${pregnant} of ${checks.size} checked ${cowWord(checks.size)} ${checks.size === 1 ? 'was' : 'were'} pregnant.`
    : 'No pregnancy checks in these dates.';

  const births = new Map();
  for (const row of snapshot.calvings || []) {
    if (row.voidedAt || !row.birthDate) continue;
    const dam = animals.get(row.damId);
    if (!dam || dam.voidedAt || !inGroup(dam, groupId)) continue;
    if (!births.has(row.damId)) births.set(row.damId, []);
    births.get(row.damId).push(row.birthDate);
  }
  const gaps = [];
  for (const dates of births.values()) {
    const ordered = [...dates].sort();
    for (let i = 1; i < ordered.length; i += 1) {
      if (!inWindow(ordered[i], from, to)) continue;
      gaps.push(Math.round((Date.parse(`${ordered[i]}T00:00:00Z`) - Date.parse(`${ordered[i - 1]}T00:00:00Z`)) / 86400000));
    }
  }
  const intervalText = gaps.length
    ? `Average ${Math.round(gaps.reduce((sum, days) => sum + days, 0) / gaps.length)} days from ${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'} between calvings.`
    : 'Not enough calvings to measure a gap.';

  const weights = [];
  for (const row of snapshot.weights || []) {
    if (row.voidedAt || row.type !== 'weaning' || !inWindow(row.date, from, to)) continue;
    const animal = animals.get(row.animalId);
    if (!animal || animal.voidedAt || !inGroup(animal, groupId)) continue;
    const scaled = toScaled(weightParts(row.value), row.unit, displayUnit);
    if (scaled != null) weights.push(scaled);
  }
  const weaningAverage = averageWeight(weights);
  const weaningText = weaningAverage
    ? `Average ${weaningAverage} ${displayUnit} from ${weights.length} weaning ${weights.length === 1 ? 'weight' : 'weights'}.`
    : 'No weaning weights in these dates.';

  const dams = new Set();
  let calves = 0;
  let live = 0;
  for (const row of snapshot.calvings || []) {
    if (row.voidedAt || !inWindow(row.birthDate, from, to)) continue;
    const dam = animals.get(row.damId);
    if (!dam || dam.voidedAt || !inGroup(dam, groupId)) continue;
    dams.add(dam.id);
    for (const calf of row.calves || []) {
      calves += 1;
      if (calf.outcome === 'live') live += 1;
    }
  }
  const calvesText = dams.size
    ? `${calves} ${calves === 1 ? 'calf' : 'calves'} from ${dams.size} ${cowWord(dams.size)}. ${live} ${live === 1 ? 'was' : 'were'} born alive.`
    : 'No calvings in these dates.';

  const scope = groupId ? (groupName(snapshot, groupId) || 'Selected group') : '';
  return {
    window: scope ? `${windowLabel(from, to)}. Group ${scope}.` : windowLabel(from, to),
    lines: [calvingText, pregnancyText, intervalText, weaningText, calvesText, 'Actual weaning weights. No age adjustment.'],
    counts: {
      exposed: exposed.size,
      calvedOfExposed: both,
      otherCalved: other,
      pregnant,
      checked: checks.size,
      gaps: gaps.length,
      averageDays: gaps.length ? Math.round(gaps.reduce((sum, days) => sum + days, 0) / gaps.length) : null,
      weaningCount: weights.length,
      weaningAverage,
      calves,
      cows: dams.size,
      live,
    },
  };
}

function moneyBuckets(snapshot, { from = '', to = '', damId = '', groupId = '' } = {}) {
  const animals = byId(snapshot);
  const damOf = new Map();
  for (const birth of snapshot.calvings || []) {
    if (birth.voidedAt) continue;
    for (const calf of birth.calves || []) if (!damOf.has(calf.calfId)) damOf.set(calf.calfId, birth.damId);
  }
  const cows = new Map();
  for (const move of snapshot.movements || []) {
    if (move.voidedAt || move.type !== 'sale' || !inWindow(move.date, from, to)) continue;
    const dam = damOf.get(move.animalId);
    if (!dam || (damId && dam !== damId)) continue;
    const cow = animals.get(dam);
    if (!cow || cow.voidedAt || !inGroup(cow, groupId)) continue;
    if (!cows.has(dam)) cows.set(dam, { damId: dam, label: labelOf(cow), currencies: new Map(), missing: [] });
    const bag = cows.get(dam);
    const calf = animals.get(move.animalId);
    const sale = {
      calfId: move.animalId,
      calf: labelOf(calf),
      date: move.date,
      amount: move.amount,
      currency: move.currency,
      pricePerPound: null,
    };
    if (!parseDecimal(move.amount || '') || !CURRENCY.test(move.currency || '')) {
      bag.missing.push(sale);
      continue;
    }
    if (move.weightValue > 0 && (move.weightUnit === 'lb' || move.weightUnit === 'kg')) {
      sale.pricePerPound = pricePerPound(move.amount, move.weightValue, move.weightUnit);
    }
    if (!bag.currencies.has(move.currency)) bag.currencies.set(move.currency, []);
    bag.currencies.get(move.currency).push(sale);
  }
  return [...cows.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function calfSales(snapshot, options = {}) {
  const cows = moneyBuckets(snapshot, options);
  const lines = [];
  const byCow = [];
  let currencies = new Set();
  for (const cow of cows) {
    const entry = { damId: cow.damId, label: cow.label, currencies: {}, missing: cow.missing };
    for (const [currency, sales] of [...cow.currencies.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const total = addMoney(sales.map((sale) => sale.amount));
      entry.currencies[currency] = { total, sales };
      currencies.add(currency);
      lines.push(`${cow.label}: ${currency} ${total}.`);
      for (const sale of sales) {
        lines.push(sale.pricePerPound
          ? `${sale.calf}: ${currency} ${sale.pricePerPound} per pound.`
          : `${sale.calf}: Weight not entered.`);
      }
    }
    for (const sale of cow.missing) lines.push(`${sale.calf}: Price not entered.`);
    byCow.push(entry);
  }
  if (currencies.size > 1) lines.push('Each currency stays apart.');
  if (!lines.length) lines.push('No calf sales in these dates.');
  return { lines, byCow };
}

function row(id, cells) {
  return { id, cells };
}

function blanks(columns) {
  return Array.from({ length: BLANK_LINES }, (_, index) => row(`blank-${index}`, columns.map(() => '')));
}

function healthSnapshot(snapshot, now) {
  return evaluateWithdrawal({
    animals: snapshot.animals || [],
    treatments: snapshot.treatments || [],
    treatmentCourses: snapshot.treatmentCourses || [],
    movements: snapshot.movements || [],
    metadata: snapshot.metadata || [{}],
    operation: snapshot.operation || [{ timeZone: 'Etc/UTC' }],
  }, { now });
}

function shownRange(season, text) {
  return season ? `${season}: ${text}` : text;
}

export function shelfReport(snapshot, { type, from = '', to = '', unit, now, groupId = '', season = '' } = {}) {
  const zone = snapshot.operation?.[0]?.timeZone || 'Etc/UTC';
  const today = farmDay(now, zone);
  const animals = (snapshot.animals || []).filter((animal) => animal && !animal.voidedAt);
  const picked = (animal) => inGroup(animal, groupId);
  if (type === 'herd-book') {
    const columns = ['Animal', 'Sex and status', 'Birth', 'Mother and father', 'Group'];
    const rows = animals.filter(picked).sort((a, b) => labelOf(a).localeCompare(labelOf(b))).map((animal) => row(animal.id, [
      labelOf(animal),
      `${plainOption(animal.sex)}. ${plainOption(animal.status)}.`,
      animal.birthDate || 'Birth date not entered',
      `Mother ${parentText(snapshot, animal, 'dam')}. Father ${parentText(snapshot, animal, 'sire')}.`,
      groupName(snapshot, animal.currentGroupId) || animal.pasture || 'No group',
    ]));
    return {
      title: 'Herd book',
      columns,
      rows,
      animalIds: rows.map((line) => line.id),
      legend: 'One row for each saved animal. Voided animals stay out. Date boxes do not hide rows on this list.',
      range: shownRange(season, 'All saved animals'),
    };
  }
  if (type === 'open-cows') {
    const latest = new Map();
    for (const check of snapshot.pregnancyChecks || []) {
      if (check.voidedAt) continue;
      const prev = latest.get(check.animalId);
      if (!prev || check.date > prev.date || (check.date === prev.date && check.id > prev.id)) latest.set(check.animalId, check);
    }
    const columns = ['Animal', 'Last check', 'Status'];
    const rows = animals.filter((animal) => picked(animal) && latest.get(animal.id)?.result === 'open')
      .sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
      .map((animal) => row(animal.id, [labelOf(animal), `${latest.get(animal.id).date}. Open.`, plainOption(animal.status)]));
    return {
      title: 'Open cows',
      columns,
      rows,
      animalIds: rows.map((line) => line.id),
      legend: 'The latest pregnancy check says open. A newer check replaces an older one. Date boxes do not hide rows.',
      range: shownRange(season, 'Current list'),
    };
  }
  if (type === 'expected-calving') {
    let due = dueRows(snapshot, today).filter((line) => picked(snapshot.animals.find((animal) => animal.id === line.animalId)));
    if (from || to) due = due.filter((line) => line.kind !== 'due' || inWindow(line.date, from, to));
    return {
      title: 'Expected calving',
      columns: ['Who is due'],
      rows: due.map((line) => row(line.animalId, [line.text])),
      animalIds: due.map((line) => line.animalId),
      legend: 'Due dates are only dates you saved. Nothing here guesses a calf date.',
      range: shownRange(season, windowLabel(from, to)),
    };
  }
  if (type === 'cull-list') {
    const decisions = new Map();
    for (const move of snapshot.movements || []) {
      if (move.voidedAt || move.type !== 'cull-decision') continue;
      const prev = decisions.get(move.animalId);
      if (!prev || move.date > prev.date || (move.date === prev.date && move.id > prev.id)) decisions.set(move.animalId, move);
    }
    const columns = ['Animal', 'Decision date', 'Reason'];
    const rows = animals.filter((animal) => animal.status === 'active' && picked(animal) && decisions.has(animal.id))
      .sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
      .map((animal) => {
        const move = decisions.get(animal.id);
        return row(animal.id, [labelOf(animal), move.date, move.reason || 'No reason entered']);
      });
    return {
      title: 'Cull list',
      columns,
      rows,
      animalIds: rows.map((line) => line.id),
      legend: 'These animals have a cull decision and are still active. A sale or a death takes them off this list.',
      range: shownRange(season, 'Current list'),
    };
  }
  if (type === 'barn-holds') {
    const rank = { 'needs-review': 0, held: 1, elapsed: 2 };
    const listed = healthSnapshot(snapshot, now).animals.filter((row) => picked(row.animal) && ['held', 'needs-review', 'elapsed'].some((status) => row.meat.status === status || row.milk.status === status));
    listed.sort((a, b) => (rank[a.meat.status] ?? 9) - (rank[b.meat.status] ?? 9) || labelOf(a.animal).localeCompare(labelOf(b.animal)));
    return {
      title: 'Barn hold sheet',
      columns: ['Animal', 'Meat', 'Milk'],
      rows: listed.map((item) => ({
        id: item.animal.id,
        cells: [labelOf(item.animal), `Meat: ${item.meat.label}.`, `Milk: ${item.milk.label}.`],
      })),
      animalIds: listed.map((row) => row.animal.id),
      legend: 'Holds and checks are listed. Recorded interval elapsed is not permission for slaughter or milk sale.',
      range: shownRange(season, 'Current list'),
      skipSafety: true,
    };
  }
  if (type === 'blank-chute' || type === 'blank-calving') {
    const columns = type === 'blank-chute'
      ? ['Animal', 'Weight', 'Treatment', 'Notes']
      : ['Dam', 'Date', 'Calf', 'Sex', 'Notes'];
    return {
      title: type === 'blank-chute' ? 'Blank chute sheet' : 'Blank calving sheet',
      columns,
      rows: blanks(columns),
      animalIds: [],
      legend: 'Blank lines for a day with no signal. Nothing here is a saved record.',
      range: 'Blank sheet',
      skipSafety: true,
    };
  }
  if (type === 'herd-numbers') {
    const stats = herdNumbers(snapshot, { from, to, unit, groupId });
    return {
      title: 'Herd numbers',
      columns: ['Count'],
      rows: [row('window', [stats.window]), ...stats.lines.map((line, index) => row(`line-${index}`, [line]))],
      animalIds: [],
      legend: 'Counts use saved records in the dates you pick. No target number is shown.',
      range: shownRange(season, windowLabel(from, to)),
      skipSafety: true,
    };
  }
  if (type === 'sales') {
    const sales = calfSales(snapshot, { from, to, groupId });
    const columns = ['Cow', 'Sale', 'Price per pound'];
    const rows = [];
    for (const cow of sales.byCow) {
      for (const [currency, bag] of Object.entries(cow.currencies)) {
        for (const sale of bag.sales) {
          rows.push(row(`${cow.damId}:${sale.calfId}:${sale.date}`, [
            cow.label,
            `${sale.date}. ${sale.calf}. ${currency} ${sale.amount}.`,
            sale.pricePerPound ? `${currency} ${sale.pricePerPound} per pound.` : 'Weight not entered.',
          ]));
        }
        rows.push(row(`${cow.damId}:${currency}:total`, [cow.label, `${currency} total ${bag.total}.`, Object.keys(cow.currencies).length > 1 ? 'Each currency stays apart.' : '']));
      }
      for (const sale of cow.missing) {
        rows.push(row(`${cow.damId}:${sale.calfId}:missing`, [cow.label, `${sale.date}. ${sale.calf}. Price not entered.`, '']));
      }
    }
    return {
      title: 'Calf sales',
      columns,
      rows,
      animalIds: sales.byCow.map((cow) => cow.damId),
      legend: 'Calf sales use the sale amount you saved. Each currency stays apart. Price per pound needs a sale weight.',
      range: shownRange(season, windowLabel(from, to)),
    };
  }
  return null;
}
