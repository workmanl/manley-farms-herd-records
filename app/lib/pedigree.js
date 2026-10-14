// SPDX-License-Identifier: AGPL-3.0-only
// Read-only family view. Three stacked rows. Links only when the id is a real UUID.
import { isUUID } from './validation.js';

const outcomeWords = {
  live: 'Live',
  stillborn: 'Stillborn',
  'died-after-birth': 'Died after birth',
  unknown: 'Outcome not entered',
};

function weightText(weight) {
  return weight ? `${weight.value} ${weight.unit}` : 'Not entered';
}

function person(animals, animal, path) {
  if (!animal) return { name: 'Not entered', href: null };
  if (path.has(animal.id)) return { name: 'Family link loops. Stopped.', href: null, loop: true };
  return {
    id: animal.id,
    name: animal.farmId,
    href: isUUID(animal.id) ? `#animals/${animal.id}` : null,
  };
}

function parent(animals, animal, role, path) {
  if (!animal) return { name: 'Not entered', href: null };
  const id = animal[role === 'mother' ? 'damId' : 'sireId'];
  const reference = animal[role === 'mother' ? 'damReference' : 'sireReference'];
  if (id && path.has(id)) return { name: 'Family link loops. Stopped.', href: null, loop: true };
  if (id) {
    const next = animals.get(id);
    if (!next) return { name: 'Not entered', href: null };
    return person(animals, next, path);
  }
  if (reference) return { name: reference, href: null, external: true };
  return { name: 'Not entered', href: null };
}

function grandparents(animals, animal, path) {
  const mother = animal?.damId && !path.has(animal.damId) ? animals.get(animal.damId) : null;
  const father = animal?.sireId && !path.has(animal.sireId) ? animals.get(animal.sireId) : null;
  const motherPath = mother ? new Set([...path, mother.id]) : path;
  const fatherPath = father ? new Set([...path, father.id]) : path;
  return [
    parent(animals, mother, 'mother', motherPath),
    parent(animals, mother, 'father', motherPath),
    parent(animals, father, 'mother', fatherPath),
    parent(animals, father, 'father', fatherPath),
  ];
}

export function pedigreeView(snapshot, animalId) {
  const animals = new Map((snapshot.animals || []).map((animal) => [animal.id, animal]));
  const animal = animals.get(animalId);
  if (!animal) return null;
  const path = new Set([animal.id]);
  const rows = [
    [{ role: 'This animal', ...person(animals, animal, new Set()) }],
    [
      { role: 'Mother', ...parent(animals, animal, 'mother', path) },
      { role: 'Father', ...parent(animals, animal, 'father', path) },
    ],
    ['Mother\'s mother', 'Mother\'s father', 'Father\'s mother', 'Father\'s father'].map((role, index) => ({ role, ...grandparents(animals, animal, path)[index] })),
  ];
  const seen = new Set();
  const offspring = [];
  const weights = snapshot.weights || [];
  const addCalf = (calfId, outcome, twin, birthWeightId) => {
    if (!calfId || seen.has(calfId)) return;
    seen.add(calfId);
    const calf = animals.get(calfId);
    const weaning = weights
      .filter((row) => row.animalId === calfId && row.type === 'weaning' && !row.voidedAt)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    const birth = weights.find((row) => row.id === birthWeightId && !row.voidedAt)
      || weights.find((row) => row.animalId === calfId && row.type === 'birth' && !row.voidedAt);
    const name = calf ? (calf.visualTag && calf.visualTag !== calf.farmId ? `${calf.farmId} ${calf.visualTag}` : calf.farmId) : 'Calf';
    offspring.push({
      id: calfId,
      href: isUUID(calfId) ? `#animals/${calfId}` : null,
      twin: !!twin,
      outcome: outcomeWords[outcome] || 'Outcome not entered',
      birth: weightText(birth),
      weaning: weightText(weaning),
      text: `${name}: ${outcomeWords[outcome] || 'Outcome not entered'}${twin ? ', twin' : ''}. Birth ${weightText(birth)}. Weaning ${weightText(weaning)}.`,
    });
  };
  for (const birth of snapshot.calvings || []) {
    if (birth.voidedAt || (birth.damId !== animalId && birth.sireId !== animalId)) continue;
    const twin = (birth.calves || []).length > 1;
    for (const calf of birth.calves || []) addCalf(calf.calfId, calf.outcome, twin, calf.birthWeightId);
  }
  for (const other of snapshot.animals || []) {
    if (other.voidedAt || (other.damId !== animalId && other.sireId !== animalId)) continue;
    addCalf(other.id, 'unknown', false, null);
  }
  const weaned = offspring.filter((calf) => calf.weaning !== 'Not entered').length;
  return { rows, offspring, summary: `Calves: ${offspring.length}, weaned: ${weaned}.` };
}
