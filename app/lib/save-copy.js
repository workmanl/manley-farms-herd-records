// SPDX-License-Identifier: AGPL-3.0-only
import {exportBackup, verifyBackup, previewRestore} from './backup.js';
import {backupContent, confirmRequestedBackup} from './reminders.js';
import {same} from './validation.js';
import {transaction, writeDifference} from './database.js';
const prepared = new WeakMap();
export async function prepareCopy(repo, now = new Date().toISOString(), FileType = File) {
  if (repo.demoMode) throw Error('Practice records stay here.');
  const backup = await exportBackup(repo, now);
  const bytes = JSON.stringify(backup, null, 2) + '\n';
  await verifyBackup(bytes);
  const name = `Herd backup ${now.slice(0,10)}`;
  const copy = {json: new FileType([bytes], name + '.json', {type:'application/json'}),
    text: new FileType([bytes], name + '.txt', {type:'text/plain'}), counts: backup.counts};
  prepared.set(copy, {repo, content: backupContent(backup.stores)});
  return copy;
}
// The verified file is ready before the tap. share() runs before any await to keep Safari's user gesture.
export async function saveCopy(repo, copy, {navigator: nav = navigator, download, now = new Date().toISOString()} = {}) {
  const receipt = prepared.get(copy);
  if (!receipt || receipt.repo !== repo || repo.demoMode || repo.recovery) throw Error('Wait for your copy to be ready.');
  let file;
  if (nav.share && nav.canShare) {
    try {
      if (nav.canShare({files:[copy.json]})) file = copy.json;
      else if (nav.canShare({files:[copy.text]})) file = copy.text;
    } catch { /* Use download when this browser cannot share files. */ }
  }
  if (file) {
    try { await nav.share({files:[file]}); }
    catch (e) {
      if (e.name === 'AbortError') return {kind:'cancelled'};
      download(copy.json);
      return {kind:'download', content:receipt.content};
    }
    await confirmRequestedBackup(repo, receipt.content, {now});
    return {kind:'shared', counts:copy.counts};
  }
  download(copy.json);
  return {kind:'download', content:receipt.content};
}
export async function checkCopy(repo, input, now = new Date().toISOString()) {
  if (repo.recovery || repo.demoMode) throw Error("These records are read-only. Nothing was changed here.");
  const {backup} = await verifyBackup(input);
  // Check and timestamp in the same transaction. A concurrent write cannot make an old copy green.
  await transaction(repo.db, 'readwrite', (before, tx) => {
    if (!same(backupContent(backup.stores), backupContent(before)))
      throw Error('This copy is older than your records. Save a new copy.');
    const next = structuredClone(before), meta = next.metadata[0];
    meta.lastVerifiedBackupAt = now; meta.updatedAt = now; meta.revision++;
    writeDifference(tx, before, next);
  });
  return backup.counts;
}
export const copySummary = counts => `${counts.animals} animals, ${counts.treatments} treatments.`;

export async function practiceCopy(repo, input, now = new Date().toISOString()) {
  const plan = await previewRestore(repo, input, 'replace');
  if (!plan.ready) throw Error('This copy needs a check. Nothing was changed here.');
  // Preview only. This path has no access to commitRestore.
  return checkCopy(repo, input, now);
}
