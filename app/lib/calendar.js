// SPDX-License-Identifier: AGPL-3.0-only
// Due dates come only from a date the farmer saved, or from days the farmer types.
// Days already pregnant are not a due date. No gestation length is assumed.

const day = (iso) => Date.parse(`${iso}T00:00:00Z`);
const isDay = (iso) => typeof iso === 'string' && Number.isFinite(day(iso));

export function addDays(isoDate, days) {
  if (!isDay(isoDate) || !Number.isInteger(days)) return null;
  return new Date(day(isoDate) + days * 86400000).toISOString().slice(0, 10);
}

export function daySpan(from, to) {
  if (!isDay(from) || !isDay(to)) return null;
  return Math.round((day(to) - day(from)) / 86400000);
}

// Keep a saved due date. Otherwise turn the farmer's "days until" answer into a date.
// Do not pass days already pregnant into this. That number is not a due date.
export function expectedFromDays(checkDate, daysUntil, existingDate) {
  if (existingDate) return existingDate;
  if (daysUntil === '' || daysUntil == null) return null;
  const days = Number(daysUntil);
  if (!Number.isInteger(days) || days < 0) return null;
  return addDays(checkDate, days);
}

const labelOf = (animal) => animal.visualTag && animal.visualTag !== animal.farmId
  ? `${animal.farmId} ${animal.visualTag}`
  : animal.farmId;

const breedingDate = (row) => row.serviceDate || row.exposureEnd || row.exposureStart || '';

function latestByAnimal(rows, animalKey) {
  const map = new Map();
  for (const row of rows) {
    if (row.voidedAt) continue;
    const prev = map.get(row[animalKey]);
    const stamp = row.date || breedingDate(row);
    const prevStamp = prev ? (prev.date || breedingDate(prev)) : '';
    if (!prev || stamp > prevStamp || (stamp === prevStamp && row.id > prev.id)) map.set(row[animalKey], row);
  }
  return map;
}

function sentence(label, kind, days) {
  if (kind === 'uncertain') return `${label}: Not sure yet.`;
  if (kind === 'missing') return `${label}: Due date not entered.`;
  if (kind === 'bred') return `${label}: Bred, no pregnancy check yet.`;
  if (days > 1) return `${label}: calf due in ${days} days.`;
  if (days === 1) return `${label}: calf due in 1 day.`;
  if (days === 0) return `${label}: calf due today.`;
  if (days === -1) return `${label}: calf was due 1 day ago.`;
  return `${label}: calf was due ${-days} days ago.`;
}

export function dueRows(snapshot, today) {
  const animals = new Map((snapshot.animals || []).map((animal) => [animal.id, animal]));
  const checks = latestByAnimal(snapshot.pregnancyChecks || [], 'animalId');
  const breedings = latestByAnimal(snapshot.breedings || [], 'damId');
  const rows = [];
  for (const [animalId, animal] of animals) {
    if (!animal || animal.voidedAt || animal.status !== 'active' || animal.sex === 'male' || animal.sex === 'steer') continue;
    const check = checks.get(animalId);
    const breeding = breedings.get(animalId);
    const bredOn = breeding ? breedingDate(breeding) : '';
    const checkIsCurrent = check && (!bredOn || check.date >= bredOn);
    if (check && checkIsCurrent) {
      if (check.result === 'open') continue;
      const delivered = (snapshot.calvings || []).some((birth) => !birth.voidedAt && birth.damId === animalId && birth.birthDate >= check.date);
      if (delivered) continue;
      const label = labelOf(animal);
      if (check.result === 'uncertain') {
        rows.push({ animalId, kind: 'uncertain', date: null, days: null, label, text: sentence(label, 'uncertain'), href: `#animals/${animalId}` });
      } else if (check.result === 'pregnant' && isDay(check.expectedCalvingDate)) {
        const days = daySpan(today, check.expectedCalvingDate);
        rows.push({ animalId, kind: 'due', date: check.expectedCalvingDate, days, label, text: sentence(label, 'due', days), href: `#animals/${animalId}` });
      } else if (check.result === 'pregnant') {
        rows.push({ animalId, kind: 'missing', date: null, days: null, label, text: sentence(label, 'missing'), href: `#animals/${animalId}` });
      }
      continue;
    }
    if (breeding) {
      const label = labelOf(animal);
      rows.push({ animalId, kind: 'bred', date: null, days: null, label, text: sentence(label, 'bred'), href: `#animals/${animalId}` });
    }
  }
  const rank = { due: 0, missing: 1, uncertain: 2, bred: 3 };
  rows.sort((a, b) => rank[a.kind] - rank[b.kind] || String(a.date || '9999-99-99').localeCompare(String(b.date || '9999-99-99')) || a.label.localeCompare(b.label));
  return rows;
}

export function dueThisMonth(rows, today) {
  const month = today.slice(0, 7);
  return rows.filter((row) => row.kind === 'due' && (row.date.slice(0, 7) === month || row.days < 0));
}
