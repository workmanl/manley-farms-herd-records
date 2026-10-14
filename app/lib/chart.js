// SPDX-License-Identifier: AGPL-3.0-only
// Inline weight chart. Same pound and kilogram factor as adg. No age-adjusted weights.
import { adg } from './workflows.js';

const SVG = 'http://www.w3.org/2000/svg';
const LB_PER_KG = 0.45359237;

export function toUnit(value, from, unit) {
  if (from === unit) return value;
  return unit === 'kg' ? value * LB_PER_KG : value / LB_PER_KG;
}

export function weightPoints(weights, unit) {
  return (weights || [])
    .filter((row) => row && !row.voidedAt && row.value > 0 && ['lb', 'kg'].includes(row.unit))
    .map((row) => ({ date: row.date, value: toUnit(row.value, row.unit, unit), unit, source: row }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function groupGain(snapshot, animalIds, unit = 'lb') {
  const rows = [];
  for (const animalId of animalIds || []) {
    const points = (snapshot.weights || [])
      .filter((row) => row.animalId === animalId && !row.voidedAt)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const result = points.length >= 2 ? adg(points[0], points.at(-1), unit) : { text: 'Not enough data' };
    rows.push({ animalId, ...result });
  }
  const usable = rows.filter((row) => Number.isFinite(row.value));
  if (!usable.length) return { text: 'Not enough data', rows, count: 0 };
  const value = usable.reduce((sum, row) => sum + row.value, 0) / usable.length;
  return { text: `${value.toFixed(2)} ${unit}/day`, value, count: usable.length, rows, unit };
}

function node(doc, name) {
  return doc.createElementNS(SVG, name);
}

export function drawWeightChart(doc, points, unit = 'lb') {
  const svg = node(doc, 'svg');
  svg.setAttribute('viewBox', '0 0 320 180');
  svg.setAttribute('role', 'img');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const width = 320, height = 180, pad = 28;
  if (!points || points.length < 2 || points[0].date === points.at(-1).date) {
    svg.setAttribute('aria-label', 'Not enough data');
    const text = node(doc, 'text');
    text.setAttribute('x', '16');
    text.setAttribute('y', '32');
    text.setAttribute('fill', 'currentColor');
    text.textContent = 'Not enough data';
    svg.append(text);
    return svg;
  }
  const values = points.map((point) => point.value);
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const start = Date.parse(`${points[0].date}T00:00:00Z`);
  const end = Date.parse(`${points.at(-1).date}T00:00:00Z`);
  const x = (point) => pad + ((Date.parse(`${point.date}T00:00:00Z`) - start) / (end - start)) * (width - pad * 2);
  const y = (point) => pad + (1 - (point.value - min) / span) * (height - pad * 2);
  const line = node(doc, 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('points', points.map((point) => `${x(point).toFixed(1)},${y(point).toFixed(1)}`).join(' '));
  svg.append(line);
  for (const point of points) {
    const dot = node(doc, 'circle');
    dot.setAttribute('cx', x(point).toFixed(1));
    dot.setAttribute('cy', y(point).toFixed(1));
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', 'currentColor');
    svg.append(dot);
  }
  const caption = node(doc, 'text');
  caption.setAttribute('x', '16');
  caption.setAttribute('y', '16');
  caption.setAttribute('fill', 'currentColor');
  caption.textContent = `${points[0].date} to ${points.at(-1).date}, ${unit}`;
  svg.append(caption);
  svg.setAttribute('aria-label', `Weight line, ${points.length} weights, from ${points[0].date} ${points[0].value.toFixed(1)} ${unit} to ${points.at(-1).date} ${points.at(-1).value.toFixed(1)} ${unit}.`);
  return svg;
}
