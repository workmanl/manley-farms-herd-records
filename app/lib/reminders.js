// SPDX-License-Identifier: AGPL-3.0-only
import { STORES } from "./contract.js";
import { same, requireThat as check, validateDataset } from "./validation.js";
import { transaction, writeDifference } from "./database.js";
const DAY = 86400000;
// Metadata bookkeeping and snooze-only operation revisions are not herd work.
export function backupContent(s) {
  const copy = structuredClone(s);
  const m = copy.metadata[0];
  for (const k of [
    "revision",
    "updatedAt",
    "lastExportAttemptAt",
    "lastUserConfirmedBackupAt",
    "lastVerifiedBackupAt",
    "lastObservedClockAt",
  ])
    delete m[k];
  return copy;
}
export function backupReminder(
  s,
  { now = new Date().toISOString(), reason = "routine" } = {},
) {
  if (["restore-replace", "schema-upgrade"].includes(reason))
    return {
      due: true,
      reason,
      text: "Back up and verify existing records before continuing.",
    };
  const op = s.operation[0],
    m = s.metadata[0],
    clock = Date.parse(now);
  const records = STORES.filter(
    (k) => !["metadata", "operation", "revisions"].includes(k),
  ).flatMap((k) => s[k]);
  const changes = [
    ...records.map((r) => r.updatedAt),
    ...s.revisions
      .filter(
        (r) =>
          (r.entityType !== "metadata" ||
            r.reason === "CSV import committed") &&
          !(
            r.entityType === "operation" &&
            (() => {
              const a = { ...r.priorValues },
                b = { ...r.newValues };
              for (const k of ["backupSnoozedUntil", "revision", "updatedAt"]) {
                delete a[k];
                delete b[k];
              }
              return same(a, b);
            })()
          ),
      )
      .map((r) => r.changedAt),
  ];
  const latest = changes.sort().at(-1);
  if (!latest) return { due: false, reason: "no-saved-work" };
  const last = m.lastUserConfirmedBackupAt;
  const unbacked = !last || latest > last;
  const due =
    unbacked &&
    (!op.backupSnoozedUntil || clock >= Date.parse(op.backupSnoozedUntil)) &&
    (!last || clock - Date.parse(last) >= op.backupReminderDays * DAY);
  return {
    due,
    unbacked,
    reason: last ? "interval" : "first-saved-session",
    text: last
      ? "Unbacked changes need an external backup."
      : "Your first saved work is ready for an external backup.",
  };
}
export async function snoozeBackup(
  repo,
  { now = new Date().toISOString(), days = 1 } = {},
) {
  const s = await repo.snapshot(),
    op = s.operation[0];
  await repo.mutate(
    [
      {
        store: "operation",
        expectedRevision: op.revision,
        record: {
          ...op,
          revision: op.revision + 1,
          updatedAt: now,
          backupSnoozedUntil: new Date(
            Date.parse(now) + days * DAY,
          ).toISOString(),
        },
      },
    ],
    { reason: "Snooze backup reminder" },
  );
}

export async function confirmRequestedBackup(
  repo,
  requested,
  { now = new Date().toISOString() } = {},
) {
  check(!repo.recovery, "Recovery mode is read-only");
  return transaction(repo.db, "readwrite", (before, tx) => {
    check(
      requested && same(requested, backupContent(before)),
      "Records changed or no backup was requested in this session. Download a fresh backup before confirming it.",
    );
    const next = structuredClone(before),
      m = next.metadata[0];
    m.lastUserConfirmedBackupAt = now;
    m.updatedAt = now;
    m.revision++;
    validateDataset(next, {
      acknowledgeDuplicateTags: true,
      acknowledgeParentSex: true,
    });
    writeDifference(tx, before, next);
    return next;
  });
}
