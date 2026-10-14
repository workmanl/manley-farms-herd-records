// SPDX-License-Identifier: AGPL-3.0-only
import { TERMS_VERSION, TERMS_TEXT } from "./terms-copy.js";
import { sha256 } from "./backup.js";
import { APP_VERSION } from "./database.js";
import { requireThat as check } from "./validation.js";
export async function hasAccepted(stores) {
  const m = stores.metadata[0];
  const hash = await sha256(TERMS_TEXT);
  return (
    m.activeTermsVersion === TERMS_VERSION &&
    m.termsAcknowledgments.some(
      (r) => r.version === TERMS_VERSION && r.textSha256 === hash,
    )
  );
}
export async function acknowledge(
  repo,
  checked,
  {
    now = new Date().toISOString(),
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  } = {},
) {
  check(checked === true, "Check the acknowledgment before continuing.");
  const stores = await repo.snapshot();
  const m = structuredClone(stores.metadata[0]);
  m.termsAcknowledgments.push({
    version: TERMS_VERSION,
    acceptedAt: now,
    timeZone,
    textSha256: await sha256(TERMS_TEXT),
    appVersion: APP_VERSION,
  });
  m.activeTermsVersion = TERMS_VERSION;
  m.revision++;
  m.updatedAt = now;
  await repo.mutate(
    [{ store: "metadata", record: m, expectedRevision: m.revision - 1 }],
    { reason: "First-run terms acknowledgment" },
  );
}
export async function storageStatus(storage = globalThis.navigator?.storage) {
  if (!storage)
    return { supported: false, persisted: false, usage: null, quota: null };
  try {
  const estimate = (await storage.estimate?.()) || {};
  return {
    supported: typeof storage.persist === "function",
    persisted: (await storage.persisted?.()) || false,
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
  };
  } catch { return {supported: typeof storage.persist === "function", persisted:false, usage:null, quota:null}; }
}
