// No automatic data removal. A checked file and a separate confirmation are required.
import {verifyBackup} from './backup.js';
import {backupContent} from './reminders.js';
import {same} from './validation.js';
const checked = new WeakMap();
export function hasHerdRecords(stores) {
  return Object.entries(stores).some(([name, rows]) => {
    if (['operation','metadata'].includes(name) || !Array.isArray(rows)) return false;
    // Settings and terms receipts alone are not a herd. Retain all herd history.
    return name === 'revisions' ? rows.some(row => !['operation','metadata'].includes(row.entityType)) : rows.length > 0;
  });
}
export function shouldRedirect(stores, {moved, recovery = false, drafts = false}) {
  return moved && !recovery && !drafts && !hasHerdRecords(stores);
}
export async function verifyMoveCopy(repo, input) {
  const {backup} = await verifyBackup(input);
  const content = backupContent(await repo.snapshot());
  if (!same(content, backupContent(backup.stores))) throw Error('This copy is older than your records. Save a new copy.');
  checked.set(repo, content);
  return backup.counts;
}
export async function removeMovedRecords(repo, {confirmed = false, drafts = false} = {}) {
  if (!repo.moved || repo.recovery || !confirmed || drafts) throw Error('Check your copy and confirm before removing old records. Finish any drafts first.');
  // Recheck in the same transaction as removal, including changes from another old tab.
  const {transaction, emptyDataset} = await import('./database.js');
  return transaction(repo.db, 'readwrite', (before, tx) => {
    if (!checked.has(repo) || !same(checked.get(repo), backupContent(before))) throw Error('Check a fresh copy first.');
    for (const name of Object.keys(before)) tx.objectStore(name).clear();
    const empty = emptyDataset();
    for (const [name, rows] of Object.entries(empty)) for (const row of rows) tx.objectStore(name).add(row);
    checked.delete(repo);
  }, {manualMoveRemoval:true});
}
