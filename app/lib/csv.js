// SPDX-License-Identifier: AGPL-3.0-only
import { models, STORES } from "./contract.js";
import {
  requireThat as check,
  normalize,
  same,
  validateRecord,
  validateDataset,
  isDate,
} from "./validation.js";
import {
  common,
  revision,
  transaction,
  writeDifference,
  validateTransitions,
  datasetToken,
} from "./database.js";
import { animalSnapshot } from "./workflows.js";
import { evaluateWithdrawal, departurePreview } from "./withdrawal.js";
import { envelope } from "./backup.js";
import { CSV_DICTIONARY } from "./csv-dictionary.js";
export const ESCAPING = "apostrophe-prefix-v1";
export const fields = (store) => ({ ...models.Common, ...models[store] });
export const headers = (store) => Object.keys(fields(store));
const baseType = (d) => d.type.replace(/\?$/, "");
const jsonType = (t) => t.endsWith("[]") || t === "Object" || !!models[t];
const textType = (t) =>
  !jsonType(t) && !["Number", "Integer", "Boolean"].includes(t);
const quote = (s) => '"' + String(s).replaceAll('"', '""') + '"';
export function encodeCell(value, descriptor) {
  if (value === null) return "";
  const type = baseType(descriptor);
  if (jsonType(type)) return JSON.stringify(value);
  let s = String(value);
  if (textType(type) && (/^['\t\r\n]/.test(s) || /^\s*[=+\-@]/.test(s)))
    s = "'" + s;
  return s;
}
export function exportCSV(store, rows) {
  check(STORES.includes(store), "Unknown entity");
  const f = fields(store);
  return (
    [
      headers(store).map(quote).join(","),
      ...rows.map((r) =>
        headers(store)
          .map((k) => quote(encodeCell(r[k], f[k])))
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
export const templateCSV = (store) => exportCSV(store, []);
export function exportSet(
  s,
  {
    stores = STORES,
    filters = {},
    select = () => true,
    now = new Date().toISOString(),
  } = {},
) {
  const full =
    stores.length === STORES.length &&
    STORES.every((k) => stores.includes(k)) &&
    !Object.keys(filters).length;
  check(
    full || Object.keys(filters).length,
    "Filtered exports must describe their exact scope",
  );
  const files = stores.map((store) => {
    const rows = full ? s[store] : s[store].filter((r) => select(store, r));
    return {
      store,
      fileName: store + ".csv",
      rowCount: rows.length,
      text: exportCSV(store, rows),
    };
  });
  const manifest = {
    format: "manley-herd-records-csv",
    csvVersion: 1,
    schemaVersion: 1,
    datasetId: s.metadata[0].datasetId,
    exportedAt: now,
    scope: full ? "full" : "filtered",
    filters,
    formulaEscaping: ESCAPING,
    files: files.map(({ text, ...f }) => f),
  };
  return [
    ...files,
    { fileName: "csv-manifest.json", text: JSON.stringify(manifest, null, 2) },
    { fileName: "data-dictionary.md", text: CSV_DICTIONARY },
  ];
}
// Strict RFC 4180 scanner: embedded newlines survive; trailing blank records do not.
export function parseCSV(input) {
  let text = input.replace(/^\uFEFF/, "");
  check(
    !/^\s*[\[{]/.test(text),
    "Select a CSV table. JSON and Farm Records crop backups are not herd CSV files.",
  );
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  const cellEnd = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const rowEnd = () => {
    cellEnd();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      check(!cell && !closed, "Malformed CSV quote");
      quoted = true;
    } else if (c === ",") cellEnd();
    else if (c === "\n" || c === "\r") {
      check(
        c !== "\r" || text[i + 1] === "\n",
        "Use CRLF or LF record endings",
      );
      if (c === "\r") i++;
      rowEnd();
    } else {
      check(!closed, "Unexpected text after closing quote");
      cell += c;
    }
  }
  check(!quoted, "Unclosed CSV quote");
  if (cell || closed || row.length) rowEnd();
  check(
    rows.length && rows[0].some(Boolean),
    "Empty CSV is not an import or replacement",
  );
  const names = rows.shift();
  check(
    new Set(names).size === names.length && names.every(Boolean),
    "Duplicate or empty CSV headers",
  );
  rows.forEach((r, i) =>
    check(r.length === names.length, `Row ${i + 2}: column count mismatch`),
  );
  return { headers: names, rows };
}
export function decodeCell(cell, d, options = {}) {
  if (cell === "") return null;
  const t = baseType(d);
  if (textType(t) && options.escaping === ESCAPING && cell.startsWith("'"))
    cell = cell.slice(1);
  if (jsonType(t)) return JSON.parse(cell);
  if (t === "Boolean") {
    check(["true", "false"].includes(cell), "Use true or false");
    return cell === "true";
  }
  if (["Number", "Integer", "Decimal"].includes(t)) {
    if (options.decimal === "comma") cell = cell.replace(",", ".");
    check(
      /^-?\d+(\.\d+)?$/.test(cell),
      "Use an explicit decimal number without grouping",
    );
    return t === "Decimal" ? cell : Number(cell);
  }
  if (t === "Date" && options.dateFormat && options.dateFormat !== "ISO") {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cell);
    check(m, "Use the selected date format with four-digit year");
    cell = `${m[3]}-${(options.dateFormat === "MDY" ? m[1] : m[2]).padStart(2, "0")}-${(options.dateFormat === "MDY" ? m[2] : m[1]).padStart(2, "0")}`;
  }
  if (t === "Date") check(isDate(cell), "Invalid calendar date");
  return cell;
}
export function decodeTable(store, text, options = {}) {
  check(STORES.includes(store), "Unknown entity");
  check(
    ["none", ESCAPING].includes(options.escaping),
    "Choose formula escaping explicitly",
  );
  const parsed = parseCSV(text),
    f = fields(store),
    mapping =
      options.mapping || Object.fromEntries(parsed.headers.map((k) => [k, k]));
  const mapped = parsed.headers.map((h) => mapping[h] || null);
  check(
    new Set(mapped.filter(Boolean)).size === mapped.filter(Boolean).length,
    "Two columns map to the same field",
  );
  mapped
    .filter(Boolean)
    .forEach((k) => check(Object.hasOwn(f, k), `Unknown target field: ${k}`));
  const errors = [],
    rows = [],
    generated = [];
  parsed.rows.forEach((cells, index) => {
    const line = index + 2;
    try {
      const r = {};
      cells.forEach((c, j) => {
        check(
          mapped[j] || c === "",
          `Unmapped nonempty column: ${parsed.headers[j]}`,
        );
        if (mapped[j]) r[mapped[j]] = decodeCell(c, f[mapped[j]], options);
      });
      const existing = options.existing?.find((x) => x.id === r.id);
      if (existing)
        check(
          headers(store).every((k) => mapped.includes(k)),
          "Existing ID requires every field; omitted columns cannot clear data",
        );
      if (!existing) {
        const defaults = common(options.now);
        defaults.id = options.generatedIds?.[`${store}:${line}`] || defaults.id;
        for (const k of Object.keys(models.Common))
          if (r[k] == null) r[k] = defaults[k];
        if (!cells[mapped.indexOf("id")])
          generated.push({ row: line, id: r.id });
        for (const [k, d] of Object.entries(f))
          if (!(k in r) && d.type.endsWith("?")) r[k] = null;
        if (store === "animals") {
          r.farmIdKey ??= r.farmId && normalize(r.farmId);
          r.sex ??= "unknown";
          r.status ??= "active";
          r.birthDatePrecision ??= r.birthDate ? "exact" : "unknown";
        }
        if (store === "weights") r.unit ??= options.weightUnit || null;
        if (store === "movements" && r.weightValue != null)
          r.weightUnit ??= options.weightUnit || null;
        if (store === "treatments") {
          r.doseUnit ??= r.doseValue != null ? options.doseUnit || null : null;
          r.timeZone ??= options.timeZone || null;
          if (r.administrationDate && !r.administrationAt) {
            r.administrationPrecision ??= "date-only";
            r.enteredLocalTime ??= null;
            r.offsetMinutes ??= null;
          }
          for (const key of ["meat", "milk"])
            if (
              r[key]?.state === "duration" &&
              r[key].unit == null &&
              options.withdrawalUnit
            )
              r[key].unit = options.withdrawalUnit;
        }
      }
      rows.push({ row: line, record: r, existing: !!existing });
    } catch (e) {
      errors.push({ row: line, message: e.message });
    }
  });
  return { rows, errors, generated };
}
const plans = new WeakMap();
export async function previewCSV(repo, tables, options = {}) {
  const now = options.now || new Date().toISOString(),
    before = await repo.snapshot(),
    next = structuredClone(before);
  const errors = [],
    previews = [],
    conflicts = [],
    generated = [],
    warnings = [],
    touched = new Set();
  const incoming = new Map();
  for (const table of tables) {
    check(
      !["operation", "metadata", "revisions"].includes(table.store),
      "Operation, metadata and revisions require a complete export set through advanced restore",
    );
    const decoded = decodeTable(table.store, table.text, {
      ...options,
      ...table.options,
      now,
      existing: before[table.store],
    });
    errors.push(...decoded.errors.map((e) => ({ store: table.store, ...e })));
    generated.push(
      ...decoded.generated.map((e) => ({ store: table.store, ...e })),
    );
    for (const row of decoded.rows) {
      const key = `${table.store}:${row.record.id}`;
      if (touched.has(key)) {
        errors.push({
          store: table.store,
          row: row.row,
          message: "Duplicate incoming immutable ID",
        });
        continue;
      }
      touched.add(key);
      incoming.set(key, { store: table.store, ...row });
    }
  }
  // All rows are staged before relationships are checked, including reciprocal cycles.
  for (const [key, entry] of incoming) {
    const { store, row } = entry;
    let record = structuredClone(entry.record);
    const prior = before[store].find((r) => r.id === record.id),
      decision = options.decisions?.[key];
    try {
      if (prior && same(prior, record)) {
        previews.push({ store, row, action: "identical: skip", record });
        continue;
      }
      if (prior) {
        conflicts.push({
          key,
          store,
          row,
          local: prior,
          incoming: record,
          choice: decision?.choice || null,
        });
        if (decision?.choice === "skip") {
          previews.push({ store, row, action: "keep current", record: prior });
          continue;
        }
        check(
          decision?.choice === "correct",
          "Resolve the same-ID conflict: skip or correct",
        );
        record = {
          ...record,
          createdAt: prior.createdAt,
          updatedAt: now,
          revision: prior.revision + 1,
        };
        next.revisions.push(revision(store, prior, record, decision));
        next[store][next[store].findIndex((r) => r.id === record.id)] = record;
      } else {
        if (decision?.choice === "skip") {
          previews.push({ store, row, action: "skip new row", record });
          continue;
        }
        next[store].push(record);
      }
      previews.push({ store, row, action: prior ? "correct" : "add", record });
    } catch (e) {
      errors.push({ store, row, message: e.message });
    }
  }
  // New animal imports create missing mirror identifiers. Existing identity edits must
  // supply their explicit historical identifier/membership changes in the same set.
  for (const p of previews.filter(
    (p) => p.store === "animals" && p.action === "add",
  )) {
    const a = p.record;
    for (const [field, type] of [
      ["farmId", "farm-id"],
      ["visualTag", "visual-tag"],
      ["rfid", "rfid"],
    ]) {
      if (
        a[field] &&
        !next.identifiers.some(
          (r) =>
            r.animalId === a.id && r.type === type && !r.validTo && !r.voidedAt,
        )
      )
        next.identifiers.push({
          ...common(now),
          animalId: a.id,
          type,
          value: a[field],
          normalizedValue: normalize(a[field]),
          validFrom: null,
          validTo: null,
          replacementReason: null,
          activeRfidKey: type === "rfid" ? normalize(a[field]) : null,
        });
    }
  }
  for (const p of previews.filter((p) =>
    ["add", "correct"].includes(p.action),
  )) {
    try {
      const r = p.record;
      if (
        "snapshots" in models[p.store] &&
        !r.snapshots &&
        p.action === "add"
      ) {
        check(
          options.confirmCurrentSnapshots,
          "Supply historical snapshots or explicitly confirm current identity snapshots",
        );
        const ids = [
          ...new Set(
            [
              r.animalId,
              r.damId,
              r.sireId,
              ...(r.calves || []).map((c) => c.calfId),
            ].filter(Boolean),
          ),
        ];
        r.snapshots = ids.map((id) => {
          const a = next.animals.find((a) => a.id === id);
          check(a, "Snapshot animal ID not found");
          return animalSnapshot(next, a);
        });
        warnings.push(
          `${p.store} row ${p.row}: current identity used for snapshot`,
        );
      }
      validateRecord(p.store, r);
      if (p.store === "treatments" && r.administrationAt)
        check(
          r.administrationAt <= now,
          "Future completed administration is not allowed",
        );
    } catch (e) {
      errors.push({ store: p.store, row: p.row, message: e.message });
    }
  }
  // Movements change the cached status only from the latest retained departure.
  for (const a of next.animals) {
    if (
      !previews.some(
        (p) =>
          p.store === "movements" &&
          ["add", "correct"].includes(p.action) &&
          p.record.animalId === a.id,
      )
    )
      continue;
    const departures = next.movements
      .filter(
        (m) =>
          m.animalId === a.id &&
          !m.voidedAt &&
          ["sale", "death", "other-departure"].includes(m.type),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    const latest = departures[0];
    if (!latest) continue;
    const status =
      latest.type === "death"
        ? "dead"
        : latest.type === "sale"
          ? "sold"
          : "culled";
    if (a.status !== status) {
      const prior = structuredClone(a);
      a.status = status;
      a.updatedAt = now;
      a.revision++;
      next.revisions.push(
        revision("animals", prior, a, {
          reason: "CSV movement updates latest departure status",
        }),
      );
      warnings.push(`${a.farmId}: resulting status ${status}`);
    }
  }
  let health = null,
    departures = [];
  if (!errors.length)
    try {
      validateTransitions(before, next);
      warnings.push(
        ...validateDataset(next, {
          acknowledgeDuplicateTags: true,
          acknowledgeParentSex: true,
        }).warnings,
      );
      health = evaluateWithdrawal(next, { now });
      departures = previews
        .filter(
          (p) =>
            p.store === "movements" &&
            ["add", "correct"].includes(p.action) &&
            ["sale", "death", "other-departure"].includes(p.record.type),
        )
        .map((p) => ({
          id: p.record.id,
          ...departurePreview(next, p.record.animalId, p.record.date, now),
        }));
    } catch (e) {
      errors.push({ row: "dataset", message: e.message });
    }
  if (previews.some((p) => ["add", "correct"].includes(p.action))) {
    // Imported historical timestamps must not hide newly unbacked work.
    const prior = structuredClone(next.metadata[0]);
    const updated = { ...prior, revision: prior.revision + 1, updatedAt: now };
    next.metadata[0] = updated;
    next.revisions.push(
      revision("metadata", prior, updated, { reason: "CSV import committed" }),
    );
  }
  const plan = {
    rows: previews,
    errors,
    conflicts,
    generated,
    warnings,
    health,
    departures,
    ready: !errors.length,
    counts: Object.fromEntries(STORES.map((k) => [k, next[k].length])),
  };
  plans.set(plan, {
    repo,
    before: datasetToken(before),
    next: structuredClone(next),
    ready: plan.ready,
    warnings: warnings.length,
  });
  return plan;
}
export async function commitCSV(
  repo,
  plan,
  { confirmed = false, acknowledgeWarnings = false } = {},
) {
  const p = plans.get(plan);
  check(
    !repo.recovery && p?.repo === repo && p.ready,
    "Import preview is incomplete or invalid",
  );
  check(confirmed, "Confirm this complete import once before committing");
  check(
    !p.warnings || acknowledgeWarnings,
    "Review duplicate tags, parentage and snapshot warnings first",
  );
  const result = await transaction(repo.db, "readwrite", (before, tx) => {
    check(
      datasetToken(before) === p.before,
      "Stale import preview. Preview again before saving",
    );
    validateTransitions(before, p.next);
    validateDataset(p.next, {
      acknowledgeDuplicateTags: true,
      acknowledgeParentSex: true,
    });
    writeDifference(tx, before, p.next);
    return p.next;
  });
  plans.delete(plan);
  return result;
}
// Complete canonical sets use the existing advanced JSON restore safety boundary.
export async function csvSetBackup(manifest, files) {
  check(
    manifest?.format === "manley-herd-records-csv" &&
      manifest.scope === "full" &&
      manifest.csvVersion === 1 &&
      manifest.schemaVersion === 1 &&
      manifest.formulaEscaping === ESCAPING,
    "Select a supported full Herd Records CSV set, not a crop backup or filtered export",
  );
  check(
    manifest.files?.length === STORES.length &&
      new Set(manifest.files.map((f) => f.store)).size === STORES.length,
    "Full set must contain every store exactly once",
  );
  const stores = {};
  for (const store of STORES) {
    const f = manifest.files.find((f) => f.store === store);
    check(
      f?.fileName === store + ".csv" && typeof files[f.fileName] === "string",
      `Missing ${store}.csv`,
    );
    const parsed = parseCSV(files[f.fileName]);
    check(
      same(parsed.headers, headers(store)),
      `${store}: canonical headers required for full restore`,
    );
    stores[store] = parsed.rows.map((cells) =>
      Object.fromEntries(
        parsed.headers.map((k, i) => [
          k,
          decodeCell(cells[i], fields(store)[k], { escaping: ESCAPING }),
        ]),
      ),
    );
    check(stores[store].length === f.rowCount, `${store}: row count mismatch`);
  }
  check(
    stores.metadata[0]?.datasetId === manifest.datasetId,
    "Dataset identity mismatch",
  );
  for (const audit of stores.revisions) {
    const target = stores[audit.entityType]?.find(
      (r) => r.id === audit.entityId,
    );
    check(
      target && target.revision >= audit.newValues.revision,
      "Revision history is ahead of its target record",
    );
    if (target.revision === audit.newValues.revision)
      check(
        same(target, audit.newValues),
        "Revision history does not match its current target values",
      );
    for (const later of stores.revisions.filter(
      (r) =>
        r.entityType === audit.entityType &&
        r.entityId === audit.entityId &&
        r.priorValues.revision === audit.newValues.revision,
    ))
      check(
        same(audit.newValues, later.priorValues),
        "Conflicting revision history chain",
      );
  }
  return envelope(stores, manifest.exportedAt);
}
