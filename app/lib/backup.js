import {backupError} from './file-safety.js';
// SPDX-License-Identifier: AGPL-3.0-only
import { STORES } from "./contract.js";
import {
  canonical,
  same,
  validateDataset,
  exactKeys,
  requireThat as check,
  isInstant,
  isUUID,
} from "./validation.js";
import {
  APP_VERSION,
  transaction,
  writeDifference,
  revision,
  datasetToken,
  validateTransitions,
} from "./database.js";
export async function sha256(text) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function envelope(stores, exportedAt = new Date().toISOString()) {
  validateDataset(stores, {
    acknowledgeDuplicateTags: true,
    acknowledgeParentSex: true,
  });
  stores = structuredClone(stores);
  for (const name of STORES)
    stores[name].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = {
    format: "manley-herd-records",
    schemaVersion: 1,
    appVersion: APP_VERSION,
    datasetId: stores.metadata[0].datasetId,
    exportedAt,
    counts: Object.fromEntries(STORES.map((k) => [k, stores[k].length])),
    stores,
  };
  return {
    ...body,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "herd-json-v1",
      value: await sha256(canonical(body)),
    },
  };
}
export async function exportBackup(repo, now, onProgress = () => {}) {
  onProgress({ phase: "Reading records", percent: 0 });
  const stores = await repo.snapshot();
  onProgress({ phase: "Checking your copy", percent: 40 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const backup = await envelope(stores, now);
  onProgress({ phase: "Backup ready to save", percent: 100 });
  return backup;
}
export async function verifyBackup(input) {
  try { return await verifyBackupBytes(input); }
  catch (error) { throw Error(backupError(error)); }
}
async function verifyBackupBytes(input) {
  let b;
  try {
    b = typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  } catch {
    throw new Error(
      "Not valid JSON. Select an unmodified Herd Records JSON backup.",
    );
  }
  check(
    b?.format === "manley-herd-records",
    "Not a Herd Records backup. Farm Records crop backups use a different format.",
  );
  check(
    b.schemaVersion === 1,
    "This file format needs a compatible app. No records were changed.",
  );
  exactKeys(
    b,
    [
      "format",
      "schemaVersion",
      "appVersion",
      "datasetId",
      "exportedAt",
      "counts",
      "stores",
      "integrity",
    ],
    "backup",
  );
  check(
    typeof b.appVersion === "string" &&
      /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(b.appVersion) &&
      isUUID(b.datasetId) &&
      isInstant(b.exportedAt),
    "backup metadata invalid",
  );
  exactKeys(b.counts, STORES, "counts");
  exactKeys(b.stores, STORES, "stores");
  exactKeys(
    b.integrity,
    ["algorithm", "canonicalization", "value"],
    "integrity",
  );
  check(
    b.integrity.algorithm === "SHA-256" &&
      b.integrity.canonicalization === "herd-json-v1" &&
      /^[0-9a-f]{64}$/.test(b.integrity.value),
    "unsupported checksum",
  );
  const { integrity, ...body } = b;
  check(
    (await sha256(canonical(body))) === integrity.value,
    "Checksum mismatch. Obtain the original backup; no records were changed.",
  );
  for (const name of STORES)
    check(
      Array.isArray(b.stores[name]) &&
        Number.isSafeInteger(b.counts[name]) &&
        b.counts[name] === b.stores[name].length,
      "Count mismatch: " + name,
    );
  const { warnings } = validateDataset(b.stores, {
    acknowledgeDuplicateTags: true,
    acknowledgeParentSex: true,
  });
  check(
    b.datasetId === b.stores.metadata[0].datasetId &&
      b.schemaVersion === b.stores.metadata[0].schemaVersion,
    "The herd name or file version does not match.",
  );
  if (
    b.stores.treatments.some(
      (t) =>
        !t.voidedAt &&
        t.administrationAt &&
        Date.parse(t.administrationAt) > Date.now(),
    )
  )
    warnings.push(
      "Future completed administration: review the imported timing and device clock before use.",
    );
  return { backup: b, warnings };
}
// Plans are private capabilities. Callers cannot mutate staged records after validation.
const plans = new WeakMap();
export async function previewRestore(
  repo,
  input,
  mode = "replace",
  decisions = {},
  { now = new Date().toISOString(), onProgress = () => {} } = {},
) {
  check(["replace", "merge"].includes(mode), "choose replace or merge");
  onProgress({ phase: "Verifying backup", percent: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const { backup, warnings } = await verifyBackup(input);
  onProgress({ phase: "Staging restore preview", percent: 40 });
  const local = await repo.snapshot();
  const incoming = backup.stores;
  const staged =
    mode === "replace" ? structuredClone(incoming) : structuredClone(local);
  const conflicts = [];
  let added = 0,
    skipped = 0;
  if (mode === "merge")
    for (const name of STORES)
      for (const row of incoming[name]) {
        const singleton = ["operation", "metadata"].includes(name);
        const existing = singleton
          ? staged[name][0]
          : staged[name].find((r) => r.id === row.id);
        if (!existing) {
          staged[name].push(structuredClone(row));
          added++;
          continue;
        }
        if (same(existing, row)) {
          skipped++;
          continue;
        }
        const key = `${name}:${row.id}`;
        const choice = decisions[key]?.choice;
        const conflict = {
          key,
          store: name,
          id: row.id,
          local: existing,
          incoming: row,
          choice: choice || null,
        };
        conflicts.push(conflict);
        if (choice === "local") continue;
        if (choice === "incoming") {
          check(
            name !== "revisions",
            "Revision ID conflict: preserve local or cancel; history cannot be overwritten.",
          );
          const next = {
            ...structuredClone(row),
            id: existing.id,
            createdAt: existing.createdAt,
            revision: existing.revision + 1,
            updatedAt: now,
          };
          if (name === "metadata") {
            next.datasetId = existing.datasetId;
            next.activeTermsVersion = existing.activeTermsVersion;
            next.termsAcknowledgments = unionReceipts(
              existing.termsAcknowledgments,
              row.termsAcknowledgments,
            );
          }
          staged.revisions.push(
            revision(name, existing, next, {
              reason: decisions[key].reason,
              operator: decisions[key].operator,
              holdReview: decisions[key].holdReview,
            }),
          );
          staged[name][staged[name].findIndex((r) => r.id === existing.id)] =
            next;
        }
      }
  const meta = staged.metadata[0],
    prior = structuredClone(meta),
    localMeta = local.metadata[0];
  if (mode === "replace") meta.activeTermsVersion = null;
  else {
    meta.datasetId = localMeta.datasetId;
    meta.activeTermsVersion = localMeta.activeTermsVersion;
    meta.termsAcknowledgments = unionReceipts(
      unionReceipts(localMeta.termsAcknowledgments, meta.termsAcknowledgments),
      incoming.metadata[0].termsAcknowledgments,
    );
  }
  for (const k of [
    "lastExportAttemptAt",
    "lastUserConfirmedBackupAt",
    "lastVerifiedBackupAt",
  ])
    meta[k] = null;
  if (
    incoming.metadata[0].lastObservedClockAt &&
    incoming.metadata[0].lastObservedClockAt > now
  )
    meta.clockReviewRequired = true;
  if (localMeta.clockReviewRequired) meta.clockReviewRequired = true;
  if (!same(meta, prior)) {
    meta.revision++;
    meta.updatedAt = now;
    staged.revisions.push(
      revision("metadata", prior, meta, {
        reason:
          "Restore: reset device-local consent and backup receipts; preserve clock review.",
      }),
    );
  }
  const unresolved = conflicts.filter(
    (c) => !["local", "incoming"].includes(c.choice),
  );
  let validationError = null;
  if (!unresolved.length)
    try {
      if (mode === "merge") validateTransitions(local, staged);
      for (const warning of validateDataset(staged, {
        acknowledgeDuplicateTags: true,
        acknowledgeParentSex: true,
      }).warnings)
        if (!warnings.includes(warning)) warnings.push(warning);
    } catch (e) {
      validationError = e.message;
    }
  const plan = {
    mode,
    counts: Object.fromEntries(STORES.map((k) => [k, staged[k].length])),
    conflicts,
    warnings,
    added,
    skipped,
    validationError,
    ready: !unresolved.length && !validationError,
  };
  plans.set(plan, {
    staged: structuredClone(staged),
    token: datasetToken(local),
    repo,
    ready: plan.ready,
    mode,
    warnings: [...warnings],
  });
  onProgress({ phase: "Records ready to check", percent: 100 });
  return plan;
}
function unionReceipts(a, b) {
  const out = structuredClone(a);
  for (const r of b)
    if (!out.some((x) => same(x, r))) out.push(structuredClone(r));
  return out;
}
export async function commitRestore(
  repo,
  plan,
  {
    safetyBackup,
    downloadConfirmed = false,
    acknowledgeWarnings = false,
    onProgress = () => {},
  } = {},
) {
  check(
    !repo.recovery && !repo.moved,
    "Recovery mode is read-only. Export and reopen with a compatible app.",
  );
  onProgress({ phase: "Checking your current copy", percent: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const staged = plans.get(plan);
  check(
    staged && staged.repo === repo && staged.ready,
    "Restore preview is incomplete or invalid.",
  );
  check(
    !staged.warnings.length || acknowledgeWarnings,
    "Acknowledge preview warnings first.",
  );
  if (staged.mode === "replace") {
    check(
      downloadConfirmed && safetyBackup,
      "Save and check a copy of your current herd before replacing it.",
    );
    const verified = await verifyBackup(safetyBackup);
    check(
      datasetToken(sorted(verified.backup.stores)) ===
        datasetToken(sorted(JSON.parse(staged.token))),
      "Safety backup does not match the herd in this preview.",
    );
  }
  const result = await transaction(repo.db, "readwrite", (current, tx) => {
    check(
      datasetToken(current) === staged.token,
      "Stale restore preview. Records changed in another tab. Preview again.",
    );
    validateDataset(staged.staged, {
      acknowledgeDuplicateTags: acknowledgeWarnings || !staged.warnings.length,
      acknowledgeParentSex: acknowledgeWarnings || !staged.warnings.length,
    });
    writeDifference(tx, current, staged.staged, onProgress);
    return staged.staged;
  });
  onProgress({ phase: "Records restored", percent: 100 });
  plans.delete(plan);
  return result;
}
function sorted(s) {
  s = structuredClone(s);
  for (const k of STORES) s[k].sort((a, b) => a.id.localeCompare(b.id));
  return s;
}
