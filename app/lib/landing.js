// SPDX-License-Identifier: AGPL-3.0-only
// Collapse the static introduction without removing crawler-readable copy.
export function updateIntroduction(element, stores) {
  const hasRecords = Object.entries(stores).some(([name, rows]) =>
    !["operation", "metadata"].includes(name) && Array.isArray(rows) && rows.length > 0,
  );
  if (hasRecords) element.open = false;
  return hasRecords;
}
