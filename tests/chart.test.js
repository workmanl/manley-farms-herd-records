// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { drawWeightChart, groupGain, weightPoints } from '../app/lib/chart.js';
import { adg } from '../app/lib/workflows.js';

const source = readFileSync(new URL('../app/lib/chart.js', import.meta.url), 'utf8');
const doc = new JSDOM('<!doctype html><html></html>').window.document;
const weight = (partial) => ({ voidedAt: null, type: 'other', unit: 'lb', ...partial });

test('the weight line is inline svg and same-day or single weights say not enough data', () => {
  assert.doesNotMatch(source, /innerHTML|\.put\(|205/);
  const quiet = drawWeightChart(doc, [{ date: '2026-10-01', value: 100 }], 'lb');
  assert.equal(quiet.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(quiet.getAttribute('viewBox'), '0 0 320 180');
  assert.equal(quiet.getAttribute('role'), 'img');
  assert.match(quiet.textContent, /Not enough data/);
  assert.equal(quiet.querySelector('polyline'), null);
  assert.equal(quiet.querySelector('script'), null);
  const sameDay = drawWeightChart(doc, [{ date: '2026-10-01', value: 100 }, { date: '2026-10-01', value: 110 }], 'lb');
  assert.match(sameDay.textContent, /Not enough data/);
  const line = drawWeightChart(doc, [{ date: '2026-10-01', value: 100 }, { date: '2026-10-11', value: 110 }], 'lb');
  assert.equal(line.querySelector('polyline').getAttribute('stroke'), 'currentColor');
  assert.equal(line.querySelectorAll('circle').length, 2);
  assert.match(line.getAttribute('aria-label'), /2 weights/);
});

test('group gain averages each animal and keeps mixed units and negative gain', () => {
  const early = weight({ id: 'a1', animalId: 'a', date: '2026-10-01', value: 100 });
  const later = weight({ id: 'a2', animalId: 'a', date: '2026-10-11', value: 80 });
  const kgEarly = weight({ id: 'b1', animalId: 'b', date: '2026-10-01', value: 45.359237, unit: 'kg' });
  const kgLater = weight({ id: 'b2', animalId: 'b', date: '2026-10-11', value: 49.8951607, unit: 'kg' });
  const snap = { weights: [early, later, kgEarly, kgLater, weight({ id: 'v', animalId: 'a', date: '2026-10-12', value: 1, voidedAt: '2026-10-13' })] };
  const gain = groupGain(snap, ['a', 'b'], 'lb');
  const left = adg(early, later, 'lb');
  const right = adg(kgEarly, kgLater, 'lb');
  assert.ok(left.value < 0);
  assert.equal(gain.value, (left.value + right.value) / 2);
  assert.match(gain.text, /lb\/day/);
  assert.equal(groupGain(snap, ['missing']).text, 'Not enough data');
  const same = { weights: [weight({ id: 's1', animalId: 's', date: '2026-10-01', value: 10 }), weight({ id: 's2', animalId: 's', date: '2026-10-01', value: 12 })] };
  assert.equal(groupGain(same, ['s']).text, 'Not enough data');
  const points = weightPoints(snap.weights.filter((row) => row.animalId === 'b'), 'lb');
  assert.equal(points.length, 2);
  assert.ok(Math.abs(points[0].value - 100) < 0.001);
});
