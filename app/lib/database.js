import {DEPLOY} from './deploy-config.js';
// SPDX-License-Identifier: AGPL-3.0-only
import { clockState } from "./withdrawal.js";
import { indexes, STORES } from "./contract.js";
import {
  validateDataset,
  validateRecord,
  same,
  canonical,
  requireThat as check,
  needsHoldReview,
} from "./validation.js";
export const APP_VERSION = "1.3.2-beta.1";
export const DB_NAME = "manley_herd_records";
export const common = (now = new Date().toISOString()) => ({
  id: crypto.randomUUID(),
  createdAt: now,
  updatedAt: now,
  revision: 1,
  archivedAt: null,
  voidedAt: null,
});
export function emptyDataset(now = new Date().toISOString()) {
  const s = Object.fromEntries(STORES.map((k) => [k, []]));
  s.operation = [
    {
      ...common(now),
      name: "My herd",
      contact: null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      weightUnit: "lb",
      backupReminderDays: 7,
      backupSnoozedUntil: null,
      theme: "sunlight",
    },
  ];
  s.metadata = [
    {
      ...common(now),
      singletonKey: "dataset",
      format: "manley-herd-records",
      schemaVersion: 1,
      appVersion: APP_VERSION,
      datasetId: crypto.randomUUID(),
      migrationHistory: [],
      lastExportAttemptAt: null,
      lastUserConfirmedBackupAt: null,
      lastVerifiedBackupAt: null,
      lastObservedClockAt: null,
      clockReviewRequired: false,
      clockReviewedAt: null,
      clockReviewReason: null,
      termsAcknowledgments: [],
      activeTermsVersion: null,
    },
  ];
  return s;
}
function installV1(db, tx) {
  for (const name of STORES) {
    const store = db.createObjectStore(name, {
      keyPath: "id",
      autoIncrement: false,
    });
    for (const [index, keyPath, unique] of indexes[name])
      store.createIndex(index, keyPath, { unique, multiEntry: false });
  }
  const initial = emptyDataset();
  for (const name of STORES)
    for (const row of initial[name]) tx.objectStore(name).add(row);
}
export const migrations = { 1: { upgrade: installV1 } };
const movedDatabases = new WeakSet();
export function transaction(db, mode, work, {manualMoveRemoval = false} = {}) {
  if (mode !== "readonly" && movedDatabases.has(db) && !manualMoveRemoval) throw Error("This old address is read-only. Use the new address for new records.");
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORES, mode);
    } catch (error) {
      reject(error);
      return;
    }
    let result,
      failure,
      remaining = STORES.length;
    const stores = {};
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        failure ||
          tx.error ||
          new Error("Transaction aborted; no changes saved."),
      );
    for (const name of STORES) {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => {
        stores[name] = req.result;
        if (--remaining === 0)
          try {
            result = work(stores, tx);
            check(
              !(result instanceof Promise),
              "transaction work must be synchronous",
            );
          } catch (error) {
            failure = error;
            tx.abort();
          }
      };
    }
  });
}
export function revision(
  type,
  prior,
  next,
  { reason, operator = "Local operator", holdReview = null },
  now = next.updatedAt,
) {
  check(
    typeof reason === "string" && reason.trim(),
    "correction reason required",
  );
  const row = {
    ...common(now),
    entityType: type,
    entityId: prior.id,
    priorValues: structuredClone(prior),
    newValues: structuredClone(next),
    changedAt: next.updatedAt,
    operator,
    reason,
    holdReview,
  };
  validateRecord("revisions", row);
  return row;
}
export function writeDifference(tx, before, after, onProgress = () => {}) {
  let completed = 0;
  const total = Object.values(after).reduce((n, rows) => n + rows.length, 0);
  for (const name of STORES) {
    const oldRows = new Map(before[name].map((r) => [r.id, r]));
    const newRows = new Map(after[name].map((r) => [r.id, r]));
    const store = tx.objectStore(name);
    // Release changed unique keys first, still inside the same atomic transaction.
    for (const [id, row] of oldRows)
      if (!newRows.has(id) || !same(row, newRows.get(id))) store.delete(id);
    for (const [id, row] of newRows)
      if (!oldRows.has(id) || !same(row, oldRows.get(id))) {
        const request = store.add(row);
        request.onsuccess = () => {
          completed++;
          if (completed % 2000 === 0)
            onProgress({
              phase: "Writing staged records",
              percent: Math.min(99, Math.round((completed / total) * 100)),
            });
        };
      }
  }
}
// Current identifiers and primary group changes preserve the old interval rows.
export function validateTransitions(before, after) {
  for (const prior of before.animals) {
    const next = after.animals.find((a) => a.id === prior.id);
    if (!next) continue; // Explicit replacement is handled by restore, not mutate.
    for (const [field, type] of [
      ["farmId", "farm-id"],
      ["visualTag", "visual-tag"],
      ["rfid", "rfid"],
    ]) {
      if (prior[field] === next[field]) continue;
      const old = before.identifiers.find(
        (i) =>
          i.animalId === prior.id &&
          i.type === type &&
          !i.validTo &&
          !i.voidedAt,
      );
      if (old) {
        const ended = after.identifiers.find((i) => i.id === old.id);
        check(
          ended &&
            ended.value === old.value &&
            ended.animalId === old.animalId &&
            ended.type === old.type &&
            ended.validTo &&
            ended.replacementReason,
          "Replacing an identifier must close and preserve its old row with a reason.",
        );
      }
      if (next[field] !== null) {
        const replacement = after.identifiers.find(
          (i) =>
            i.animalId === prior.id &&
            i.type === type &&
            !i.validTo &&
            !i.voidedAt,
        );
        check(
          replacement &&
            replacement.id !== old?.id &&
            replacement.replacementReason,
          "Replacement identifier requires a new row and reason.",
        );
      }
    }
    if (prior.currentGroupId !== next.currentGroupId && prior.currentGroupId) {
      const old = before.memberships.find(
        (m) => m.animalId === prior.id && !m.endDate && !m.voidedAt,
      );
      const ended = old && after.memberships.find((m) => m.id === old.id);
      check(
        ended && ended.endDate && ended.groupId === old.groupId,
        "Group changes must close and preserve the old membership.",
      );
    }
  }
}
export class Repository {
  constructor(db, { recovery = null, moved = DEPLOY.moved, onVersionChange = () => {} } = {}) {
    this.db = db;
    this.recovery = recovery;
    this.moved = moved;
    if (this.moved) movedDatabases.add(db);
    this.closed = false;
    db.onversionchange = () => {
      this.closed = true;
      db.close();
      onVersionChange();
    };
  }
  close() {
    this.closed = true;
    this.db.close();
  }
  snapshot() {
    this.openingSnapshot = null;
    return transaction(this.db, "readonly", (s) => s);
  }
  observeClock(now) {
    this.openingSnapshot = null;
    check(!this.moved, "This old address is read-only. Use the new address for new records.");
    check(!this.recovery, "Recovery mode is read-only.");
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("metadata", "readwrite");
      let failure;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure || tx.error);
      const req = tx.objectStore("metadata").getAll();
      req.onsuccess = () => {
        try {
          const m = req.result[0],
            state = clockState(m, now);
          if (
            m.lastObservedClockAt === state.lastObservedClockAt &&
            m.clockReviewRequired === state.reviewRequired
          )
            return;
          const next = {
            ...m,
            updatedAt: now,
            revision: m.revision + 1,
            lastObservedClockAt: state.lastObservedClockAt,
            clockReviewRequired: state.reviewRequired,
          };
          validateRecord("metadata", next);
          tx.objectStore("metadata").put(next);
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
    });
  }
  // An independent non-birth weight has no reciprocal or uniqueness dependencies.
  // Read all of its foreign keys in the same serialized transaction as the add.
  async appendWeight(record) {
    this.openingSnapshot = null;
    check(!this.moved, "This old address is read-only. Use the new address for new records.");
    check(!this.recovery, "Recovery mode is read-only.");
    validateRecord("weights", record);
    check(
      record.type !== "birth" &&
        record.calvingId === null &&
        record.revision === 1 &&
        record.id?.[14] === "4",
      "Independent new weight required.",
    );
    check(
      record.snapshots.some((s) => s.animalId === record.animalId),
      "weights: missing involved animal snapshot",
    );
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        ["animals", "groups", "weights"],
        "readwrite",
      );
      let failure;
      tx.oncomplete = () => resolve(record);
      tx.onabort = () =>
        reject(failure || tx.error || Error("Weight was not saved."));
      const refs = [
        ["animals", record.animalId],
        ...record.snapshots.flatMap((s) => [
          ["animals", s.animalId],
          ...(s.groupId ? [["groups", s.groupId]] : []),
        ]),
      ];
      let remaining = refs.length;
      for (const [store, id] of refs) {
        const req = tx.objectStore(store).get(id);
        req.onsuccess = () => {
          try {
            check(req.result, `missing ${store} reference: ${id}`);
            if (--remaining === 0) tx.objectStore("weights").add(record);
          } catch (e) {
            failure = e;
            tx.abort();
          }
        };
      }
    });
  }
  async mutate(
    changes,
    {
      reason,
      operator,
      holdReview = null,
      acknowledgeDuplicateTags = false,
      acknowledgeParentSex = false,
      bookkeeping = false,
      expectedHealth,
    } = {},
  ) {
    this.openingSnapshot = null;
    check(
      !this.recovery && !this.moved,
      this.moved ? "This old address is read-only. Use the new address for new records." : "Recovery mode is read-only. Export existing records before recovery.",
    );
    return transaction(this.db, "readwrite", (before, tx) => {
      if (expectedHealth) {
        const actual = {
          ...Object.fromEntries(
            ["animals", "treatments", "treatmentCourses", "movements"].map(
              (key) => [
                key,
                [...before[key]].sort((a, b) => a.id.localeCompare(b.id)),
              ],
            ),
          ),
          timeZone: before.operation[0].timeZone,
          clockReviewRequired: before.metadata[0].clockReviewRequired,
        };
        check(
          same(actual, expectedHealth),
          "Treatment or departure records changed. Reload and review before saving.",
        );
      }
      const next = structuredClone(before);
      const touched = new Set();
      for (const change of changes) {
        const { store, record, expectedRevision } = change;
        check(
          STORES.includes(store) && store !== "revisions",
          "revisions are append-only through corrections",
        );
        check(!touched.has(store + record.id), "same record changed twice");
        touched.add(store + record.id);
        if (store === "treatments" && record.administrationAt) {
          check(
            Date.parse(record.administrationAt) <= Date.now(),
            "A future dose cannot be saved as a completed administration. Check the entry and device clock.",
          );
        }
        const i = next[store].findIndex((r) => r.id === record.id);
        const prior = next[store][i];
        if (prior) {
          check(
            expectedRevision === prior.revision,
            "Stale revision. Reload and review the current record.",
          );
          check(
            record.createdAt === prior.createdAt &&
              record.revision === prior.revision + 1,
            "immutable creation/revision mismatch",
          );
          if (
            store === "metadata" &&
            ((prior.clockReviewRequired && !record.clockReviewRequired) ||
              (prior.lastObservedClockAt &&
                record.lastObservedClockAt < prior.lastObservedClockAt))
          )
            check(
              !bookkeeping &&
                record.clockReviewedAt &&
                record.clockReviewedAt !== prior.clockReviewedAt &&
                record.clockReviewReason,
              "Clock reset requires an audited explicit review.",
            );
          if (store === "metadata")
            check(
              prior.termsAcknowledgments.every((r, i) =>
                same(r, record.termsAcknowledgments[i]),
              ),
              "terms receipts are append-only",
            );
          if (bookkeeping) {
            check(store === "metadata", "bookkeeping only applies to metadata");
            const allowed = [
              "revision",
              "updatedAt",
              "lastExportAttemptAt",
              "lastUserConfirmedBackupAt",
              "lastVerifiedBackupAt",
              "lastObservedClockAt",
              "clockReviewRequired",
            ];
            check(
              Object.keys(prior).every(
                (k) => allowed.includes(k) || same(prior[k], record[k]),
              ),
              "bookkeeping cannot bypass audit",
            );
          } else
            next.revisions.push(
              revision(store, prior, record, { reason, operator, holdReview }),
            );
          next[store][i] = structuredClone(record);
        } else {
          check(
            expectedRevision === null &&
              record.revision === 1 &&
              record.id?.[14] === "4",
            "new records require a v4 UUID, null expected revision and revision 1",
          );
          next[store].push(structuredClone(record));
        }
      }
      validateTransitions(before, next);
      validateDataset(next, { acknowledgeDuplicateTags, acknowledgeParentSex });
      writeDifference(tx, before, next);
      return next;
    });
  }
}
function openRaw(factory, name, version, onUpgrade, onBlocked) {
  return new Promise((resolve, reject) => {
    const req =
      version === undefined ? factory.open(name) : factory.open(name, version);
    let error;
    req.onupgradeneeded = (e) => {
      try {
        onUpgrade?.(req.result, req.transaction, e.oldVersion, (err) => {
          error = err;
          req.transaction.abort();
        });
      } catch (err) {
        error = err;
        req.transaction.abort();
      }
    };
    req.onerror = () => reject(error || req.error);
    req.onblocked = () =>
      onBlocked?.(
        "Close other Herd Records tabs to continue the database upgrade.",
      );
    req.onsuccess = () => resolve(req.result);
  });
}
async function saveRecovery(factory, name, snapshot, version) {
  const db = await openRaw(factory, name + "_recovery", 1, (db) =>
    db.createObjectStore("snapshots", { keyPath: "id" }),
  );
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put({
        id: "pre-migration",
        version,
        snapshot,
        createdAt: new Date().toISOString(),
      });
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function recoverySnapshot({
  factory = indexedDB,
  name = DB_NAME,
} = {}) {
  const db = await openRaw(factory, name + "_recovery", 1, (db) =>
    db.createObjectStore("snapshots", { keyPath: "id" }),
  );
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots");
      const req = tx.objectStore("snapshots").get("pre-migration");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function openRepository({
  factory = indexedDB,
  name = DB_NAME,
  targetVersion = 1,
  steps = migrations,
  downloadedBackup = false,
  onBlocked,
  onVersionChange,
  onBeforeUpgrade,
  initialClock,
} = {}) {
  let db = await openRaw(
    factory,
    name,
    undefined,
    (db, tx, old) => {
      check(old === 0, "unexpected initial upgrade");
      installV1(db, tx);
    },
    onBlocked,
  );
  if (db.version > targetVersion)
    return new Repository(db, {
      recovery:
        "This database is newer than this app. Use its matching source release. No downgrade or reset was attempted.",
      onVersionChange,
    });
  if (db.version === targetVersion) {
    const repo = new Repository(db, { onVersionChange });
    try {
      const validate =
        steps[targetVersion]?.validate ||
        ((s) =>
          validateDataset(s, {
            acknowledgeDuplicateTags: true,
            acknowledgeParentSex: true,
          }));
      if (initialClock && !repo.moved) {
        // One consistent launch read, validation and clock observation. The UI consumes
        // this transaction's snapshot once, rather than reading all history twice.
        repo.openingSnapshot = await transaction(db, "readwrite", (s, tx) => {
          validate(s);
          const m = s.metadata[0],
            state = clockState(m, initialClock);
          if (
            m.lastObservedClockAt !== state.lastObservedClockAt ||
            m.clockReviewRequired !== state.reviewRequired
          ) {
            s.metadata[0] = {
              ...m,
              updatedAt: initialClock,
              revision: m.revision + 1,
              lastObservedClockAt: state.lastObservedClockAt,
              clockReviewRequired: state.reviewRequired,
            };
            validateRecord("metadata", s.metadata[0]);
            tx.objectStore("metadata").put(s.metadata[0]);
          }
          return s;
        });
      } else validate(await repo.snapshot());
    } catch (e) {
      repo.recovery = "Validation failed: " + e.message;
    }
    return repo;
  }
  const oldVersion = db.version;
  const snapshot = await transaction(db, "readonly", (s) => s);
  try {
    // Called before snapshotting or opening the versionchange transaction.
    // The caller can display ownership guidance or defer the upgrade without writes.
    if (onBeforeUpgrade)
      check(
        (await onBeforeUpgrade({
          fromVersion: oldVersion,
          toVersion: targetVersion,
          snapshot: structuredClone(snapshot),
        })) !== false,
        "Schema upgrade deferred. Back up and verify existing records before continuing.",
      );
    for (let v = oldVersion + 1; v <= targetVersion; v++) {
      check(steps[v], `Missing sequential migration v${v}`);
      check(
        !steps[v].destructive || downloadedBackup,
        "Download and verify a backup before this destructive migration.",
      );
    }
    await saveRecovery(factory, name, snapshot, oldVersion);
    db.close();
    db = await openRaw(
      factory,
      name,
      targetVersion,
      (upgraded, tx, old, abort) => {
        let remaining = STORES.length;
        const current = {};
        for (const name of STORES) {
          const req = tx.objectStore(name).getAll();
          req.onsuccess = () => {
            current[name] = req.result;
            if (--remaining === 0)
              try {
                check(
                  old === oldVersion && same(current, snapshot),
                  "Records changed while migration was staged. Reopen and retry.",
                );
                let staged = structuredClone(current);
                for (
                  let version = old + 1;
                  version <= targetVersion;
                  version++
                ) {
                  const step = steps[version];
                  step.upgrade?.(upgraded, tx);
                  staged = step.transform(staged);
                  check(
                    !(staged instanceof Promise),
                    "migration transforms must be synchronous",
                  );
                  step.validate(staged);
                }
                writeDifference(tx, current, staged);
              } catch (error) {
                abort(error);
              }
          };
        }
      },
      onBlocked,
    );
    const migrated = new Repository(db, { onVersionChange });
    try {
      steps[targetVersion].validate(await migrated.snapshot());
    } catch (error) {
      migrated.recovery = `Post-migration verification failed: ${error.message}. Export recovery records and the pre-migration snapshot.`;
    }
    return migrated;
  } catch (error) {
    if (!db || db.version !== oldVersion)
      db = await openRaw(factory, name, undefined);
    else {
      try {
        db.transaction(STORES);
      } catch {
        db = await openRaw(factory, name, undefined);
      }
    }
    return new Repository(db, {
      recovery: `Migration failed: ${error.message}. Your records are still here. Save a copy or use the matching app version.`,
      onVersionChange,
    });
  }
}
export const datasetToken = (stores) => canonical(stores);
