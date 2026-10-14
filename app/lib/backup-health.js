// SPDX-License-Identifier: AGPL-3.0-only
import {backupReminder} from './reminders.js';
export function backupHealth(meta, counts, context = {}, now = Date.now()) {
  const stamp = [meta.lastUserConfirmedBackupAt, meta.lastVerifiedBackupAt].filter(Boolean).sort().at(-1);
  const date = stamp && Date.parse(stamp);
  const changed = context.changedAt && Date.parse(context.changedAt) > date;
  const old = date && now - date >= (context.reminderDays || 7) * 86400000;
  let color = 'red', text = 'Your records live only on this phone. Save a copy now.';
  if (date && date <= now) {
    color = changed || old ? 'yellow' : 'green';
    text = color === 'yellow' ? (changed ? 'You have new records. Save a copy today.' : 'Your copy is old. Save a copy today.')
      : `Your records are safe. Last copy saved ${new Intl.DateTimeFormat('en-US', {weekday:'long'}).format(new Date(date))}.`;
  }
  if (stamp && (!Number.isFinite(date) || date > now)) text = 'Check the date on this phone. Save a copy now.';
  if (context.safari) {color = 'red'; text = 'Safari may clear records on this phone. Keep a saved copy.';}
  return {color, text, checked: !!meta.lastVerifiedBackupAt && color === 'green',
    storageNote: context.persisted ? 'This phone was asked to keep your records. Keep a saved copy too.'
      : 'This phone may clear records if space runs low. Keep a saved copy.', counts};
}
export function healthFromSnapshot(s, context = {}, now = Date.now()) {
  const reminder = backupReminder(s, {now:new Date(now).toISOString()});
  return backupHealth(s.metadata[0], {animals:s.animals.length, treatments:s.treatments.length},
    {...context, reminderDays:s.operation[0].backupReminderDays, changedAt:reminder.latest}, now);
}
