// Pure assertions also tested with corrupt records so the detector proves it can fail.
import assert from 'node:assert/strict';
export const SEED_FIELDS = {farmId:'UPG777', visualTag:'00777', rfid:'982000000007777',
  sex:'female', breed:'Upgrade test Angus', birthDate:'2024-03-21', birthDatePrecision:'exact',
  pasture:'North test pasture', notes:'Synthetic upgrade test. Keep leading zeros: 00777.', status:'active'};
export function assertUpgrade(expected, actual, errors, dbVersion) {
  console.log('SEEDED RECORD AFTER UPDATE', JSON.stringify(actual.record, null, 2));
  console.log('DATABASE VERSION', actual.dbVersion, 'PAGE ERRORS', JSON.stringify(errors));
  assert.equal(actual.dbVersion, dbVersion, 'Database version changed unexpectedly');
  assert.deepEqual(errors, [], 'Page errors stop the release');
  for (const [field, value] of Object.entries(SEED_FIELDS))
    assert.equal(actual.record?.[field], value, `Seed field mismatch: ${field}`);
  assert.deepEqual(actual.record, expected.record, 'Full seeded record changed');
  assert.deepEqual(actual.stores, expected.stores, 'Seeded store fields changed');
}
