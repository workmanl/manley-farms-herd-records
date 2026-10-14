// SPDX-License-Identifier: AGPL-3.0-only
// Chute work saves one animal at a time through the existing weight and sale paths.
// Treat and move stay on the existing batch forms. This file does not add a store write of its own.
import { commitWorkflow } from './workflows.js';

export function chuteWeightInput(animalId, shared, value) {
  return {
    animalId,
    date: shared.date,
    type: shared.type,
    value,
    unit: shared.unit,
    notes: null,
  };
}

export function chuteSaleInput(animalId, shared, acknowledged) {
  return {
    animalId,
    type: 'sale',
    date: shared.date,
    destination: shared.destination,
    amount: shared.amount || null,
    currency: shared.currency || null,
    weightValue: null,
    weightUnit: null,
    acknowledgeDeparture: acknowledged === true,
  };
}

export async function saveChuteWeights(repo, animalIds, shared, valuesById, { stopAfter = Infinity } = {}) {
  const saved = [];
  for (const animalId of animalIds) {
    if (saved.length >= stopAfter) break;
    const value = valuesById?.[animalId];
    if (value == null || value === '') continue;
    const snapshot = await repo.snapshot();
    saved.push(await commitWorkflow(repo, snapshot, 'weight', chuteWeightInput(animalId, shared, value)));
  }
  return saved;
}

export async function saveChuteSale(repo, animalId, shared, acknowledged) {
  const snapshot = await repo.snapshot();
  return commitWorkflow(repo, snapshot, 'movement', chuteSaleInput(animalId, shared, acknowledged));
}
