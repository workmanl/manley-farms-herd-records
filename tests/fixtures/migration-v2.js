// SPDX-License-Identifier: AGPL-3.0-only
// Test-only v2 fixture. Never imported by the deployable app.
import { validateDataset } from "../../app/lib/validation.js";
export const v2 = {
  destructive: true,
  upgrade(db, tx) {
    tx.objectStore("groups").createIndex("testByType", "type");
  },
  transform(stores) {
    const meta = stores.metadata[0];
    meta.schemaVersion = 2;
    meta.revision++;
    meta.updatedAt = "2026-10-13T00:00:00.000Z";
    meta.migrationHistory.push({
      fromVersion: 1,
      toVersion: 2,
      completedAt: meta.updatedAt,
      appVersion: "0.2.0",
    });
    return stores;
  },
  validate(stores) {
    if (stores.metadata[0].schemaVersion !== 2) throw new Error("Expected v2");
    const compatible = structuredClone(stores);
    compatible.metadata[0].schemaVersion = 1;
    validateDataset(compatible, {
      acknowledgeDuplicateTags: true,
      acknowledgeParentSex: true,
    });
  },
};
