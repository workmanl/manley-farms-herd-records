// SPDX-License-Identifier: AGPL-3.0-only
import { STORES } from "./contract.js";
import {
  exportSet,
  templateCSV,
  parseCSV,
  headers,
  fields,
  ESCAPING,
  previewCSV,
  commitCSV,
  csvSetBackup,
} from "./csv.js";
import { assembleReport, renderReport, SWITCHING_STEPS } from "./reports.js";
export class OwnershipUI {
  constructor(root, { repository, refresh, message, advancedRestore }) {
    Object.assign(this, {
      root,
      repository,
      refresh,
      message,
      advancedRestore,
    });
    this.doc = root.ownerDocument;
  }
  el(tag, text, parent = this.root) {
    const n = this.doc.createElement(tag);
    if (text != null) n.textContent = text;
    parent?.append(n);
    return n;
  }
  button(text, action, parent = this.root) {
    const b = this.el("button", text, parent);
    b.type = "button";
    b.onclick = async () => {
      if (this.saving) return;
      b.disabled = true;
      try {
        await action();
      } catch (e) {
        this.message(e.message, true);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  }
  input(label, value = "", type = "text", parent = this.root) {
    const l = this.el("label", label, parent),
      n = this.el("input", null, l);
    n.type = type;
    n.value = value;
    return n;
  }
  select(label, values, parent = this.root) {
    const l = this.el("label", label, parent),
      n = this.el("select", null, l);
    for (const [value, text] of values.map((v) =>
      Array.isArray(v) ? v : [v, v],
    )) {
      const o = this.el("option", text, n);
      o.value = value;
    }
    return n;
  }
  check(label, parent = this.root) {
    const n = this.input(label, "", "checkbox", parent);
    n.parentNode.className = "check";
    return n;
  }
  fileLinks(files, parent) {
    parent.replaceChildren();
    for (const f of files) {
      const blob = new Blob([f.text], {
        type: f.fileName.endsWith(".csv")
          ? "text/csv;charset=utf-8"
          : "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      (this.urls ||= []).push(url);
      const a = this.el(
        "a",
        `Download ${f.fileName}`,
        this.el("p", null, parent),
      );
      a.href = url;
      a.download = f.fileName;
    }
  }
  render(s) {
    for (const url of this.urls || []) URL.revokeObjectURL(url);
    this.urls = [];
    this.s = s;
    this.root.replaceChildren();
    this.el("h1", "Reports and data ownership");
    this.reports();
    this.exports();
    this.imports();
    this.guide();
  }
  reports() {
    const section = this.el("section"),
      title = this.el("h2", "Print reports", section);
    title.id = "report-controls-title";
    const form = this.el("form", null, section);
    form.setAttribute("aria-labelledby", title.id);
    const type = this.select(
      "Report",
      [
        ["treatments", "Treatment log for BQA preparation"],
        ["calvings", "Calving book"],
        ["animal", "Individual animal card"],
      ],
      form,
    );
    const from = this.input("From date (inclusive)", "", "date", form),
      to = this.input("Through date (inclusive)", "", "date", form);
    const season = this.input(
      "Season label (uses the selected dates)",
      "",
      "text",
      form,
    );
    const animal = this.select(
      "Animal for individual card",
      [
        ["", "Choose an animal"],
        ...this.s.animals.map((a) => [
          a.id,
          `${a.farmId} | ${a.visualTag ?? "No tag"} | ${a.status}`,
        ]),
      ],
      form,
    );
    const unit = this.select("Display weight unit", ["lb", "kg"], form);
    unit.value = this.s.operation[0].weightUnit;
    const preview = this.el("article", null, section);
    preview.id = "report-print-area";
    preview.setAttribute("aria-label", "Report preview");
    let report;
    const build = () => {
      report = assembleReport(this.s, {
        type: type.value,
        from: from.value,
        to: to.value,
        season: season.value,
        animalId: animal.value,
        unit: unit.value,
      });
      renderReport(preview, report);
      print.disabled = false;
    };
    this.button(
      "Preview report",
      async () => {
        this.s = await this.repository().snapshot();
        build();
      },
      form,
    );
    const print = this.button(
      "Print / Save as PDF",
      async () => {
        this.s = await this.repository().snapshot();
        build();
        this.doc.defaultView.print();
      },
      form,
    );
    print.disabled = true;
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        build();
      } catch (e) {
        this.message(e.message, true);
      }
    };
    for (const input of form.querySelectorAll("input,select"))
      input.addEventListener("change", () => {
        print.disabled = true;
        preview.replaceChildren();
      });
    build();
  }
  exports() {
    const section = this.el("section");
    this.el("h2", "CSV exports and templates", section);
    this.el(
      "p",
      "Full exports include archived, voided and revision records. Download every listed file into one folder. CSV has no integrity checksum; verified JSON remains the authoritative backup.",
      section,
    );
    const store = this.select("Export entity or template", STORES, section);
    const from = this.input("Optional export date from", "", "date", section),
      to = this.input("Optional export date through", "", "date", section);
    const files = this.el("div", null, section);
    this.button(
      "Prepare complete CSV export set",
      async () => {
        this.fileLinks(exportSet(await this.repository().snapshot()), files);
        this.message(
          "Full set prepared. Download all 14 tables, manifest and dictionary. This does not confirm a backup.",
        );
      },
      section,
    );
    this.button(
      "Prepare entity CSV and scope manifest",
      async () => {
        if (from.value && to.value && from.value > to.value)
          throw new Error("Export date range is reversed");
        const filters = {
          entity: store.value,
          from: from.value || null,
          to: to.value || null,
          dateBasis:
            "date, birthDate, administrationDate, serviceDate, exposureStart, startDate, validFrom, changedAt, otherwise createdAt; inclusive",
        };
        this.fileLinks(
          exportSet(await this.repository().snapshot(), {
            stores: [store.value],
            filters,
            select: (_, r) => {
              const date = (
                r.date ||
                r.birthDate ||
                r.administrationDate ||
                r.serviceDate ||
                r.exposureStart ||
                r.startDate ||
                r.validFrom ||
                r.changedAt ||
                r.createdAt
              ).slice(0, 10);
              return (
                (!from.value || date >= from.value) &&
                (!to.value || date <= to.value)
              );
            },
          }),
          files,
        );
        this.message(
          "Filtered entity export prepared. Scope is in the companion manifest. This is not a complete backup.",
        );
      },
      section,
    );
    this.button(
      "Download template",
      () =>
        this.fileLinks(
          [{ fileName: store.value + ".csv", text: templateCSV(store.value) }],
          files,
        ),
      section,
    );
  }
  imports() {
    const section = this.el("section");
    this.el("h2", "CSV import", section);
    this.el(
      "p",
      "Select one or more related tables. Map every nonempty source column. Match immutable IDs only. Tags never merge animals. Unknown parent IDs must be fixed or mapped as explicit external damReference/sireReference text with no local ID. Spreadsheet resaving can change leading zeros or dates; review each value.",
      section,
    );
    const files = this.input(
      "CSV tables (multiple files allowed)",
      "",
      "file",
      section,
    );
    files.multiple = true;
    files.accept = ".csv,text/csv";
    const escaping = this.select(
      "Formula protection (explicit choice required)",
      [
        ["", "Choose source protection"],
        ["none", "None: third-party text unchanged"],
        [ESCAPING, "Herd export: remove exactly one leading apostrophe"],
      ],
      section,
    );
    const dateFormat = this.select(
        "Source dates",
        ["ISO", "MDY", "DMY"],
        section,
      ),
      decimal = this.select(
        "Decimal convention",
        [
          ["dot", "Dot decimal, no grouping"],
          ["comma", "Comma decimal, no grouping"],
        ],
        section,
      );
    const weightUnit = this.select(
      "Weight unit for missing units",
      [["", "Require per-row units"], "lb", "kg"],
      section,
    );
    const doseUnit = this.input(
      "Dose unit for missing units",
      "",
      "text",
      section,
    );
    const withdrawalUnit = this.select(
      "Withdrawal unit for missing duration units",
      [["", "Require per-rule units"], "days", "hours"],
      section,
    );
    const zone = this.input(
      "Source time zone for missing treatment zone",
      "",
      "text",
      section,
    );
    const snapshots = this.check(
      "Use current identities for missing event snapshots. I reviewed that these are not historical identities.",
      section,
    );
    const mapped = this.el("div", null, section),
      output = this.el("div", null, section);
    output.setAttribute("aria-live", "polite");
    let tables = [],
      decisions = {},
      plan,
      generatedIds = {};
    const invalidate = () => {
      plan = null;
      commit.disabled = true;
      confirmation.checked = false;
    };
    files.onchange = async () => {
      invalidate();
      mapped.replaceChildren();
      output.replaceChildren();
      tables = [];
      decisions = {};
      generatedIds = {};
      try {
        for (const file of files.files) {
          const text = await file.text(),
            parsed = parseCSV(text),
            box = this.el("fieldset", null, mapped);
          this.el("legend", file.name, box);
          const entity = this.select(
            "Target entity",
            STORES.filter(
              (k) => !["operation", "metadata", "revisions"].includes(k),
            ),
            box,
          );
          const guessed = file.name.replace(/\.csv$/i, "");
          if ([...entity.options].some((o) => o.value === guessed))
            entity.value = guessed;
          const controls = this.el("div", null, box),
            table = { store: entity.value, text, options: { mapping: {} } };
          tables.push(table);
          const mapping = () => {
            invalidate();
            table.store = entity.value;
            table.options.mapping = {};
            controls.replaceChildren();
            for (const header of parsed.headers) {
              const select = this.select(
                `Source column: ${header}`,
                [
                  ["", "Unmapped (must be empty)"],
                  ...headers(table.store).map((k) => [
                    k,
                    `${k}: ${fields(table.store)[k].type} | ${fields(table.store)[k].note}`,
                  ]),
                ],
                controls,
              );
              if (headers(table.store).includes(header)) select.value = header;
              table.options.mapping[header] = select.value;
              select.onchange = () => {
                table.options.mapping[header] = select.value;
                invalidate();
              };
            }
          };
          entity.onchange = mapping;
          mapping();
        }
      } catch (e) {
        tables = [];
        this.message(e.message, true);
      }
    };
    for (const c of [
      escaping,
      dateFormat,
      decimal,
      weightUnit,
      doseUnit,
      withdrawalUnit,
      zone,
      snapshots,
    ])
      c.onchange = invalidate;
    const preview = async () => {
      invalidate();
      if (!tables.length) throw new Error("Choose CSV tables first");
      plan = await previewCSV(this.repository(), tables, {
        escaping: escaping.value,
        dateFormat: dateFormat.value,
        decimal: decimal.value,
        weightUnit: weightUnit.value,
        doseUnit: doseUnit.value,
        withdrawalUnit: withdrawalUnit.value,
        timeZone: zone.value,
        confirmCurrentSnapshots: snapshots.checked,
        decisions,
        generatedIds,
      });
      for (const g of plan.generated)
        generatedIds[`${g.store}:${g.row}`] = g.id;
      output.replaceChildren();
      this.el("h3", "Import preview: no records changed", output);
      this.el(
        "p",
        `${plan.rows.length} rows staged. ${plan.errors.length} errors. ${plan.conflicts.length} same-ID conflicts. Formula mode: ${escaping.value}. Dates: ${dateFormat.value}. Decimal: ${decimal.value}.`,
        output,
      );
      for (const error of plan.errors)
        this.el(
          "p",
          `${error.store || "Relationships"} row ${error.row}: ${error.message}`,
          output,
        ).className = "error";
      for (const warning of plan.warnings) this.el("p", warning, output);
      for (const c of plan.conflicts) {
        const box = this.el("fieldset", null, output);
        this.el("legend", `${c.store} row ${c.row}: ${c.id || c.key}`, box);
        this.el(
          "pre",
          JSON.stringify({ current: c.local, incoming: c.incoming }, null, 2),
          box,
        );
        const choice = this.select(
          "Conflict decision",
          [
            ["", "Unresolved"],
            ["skip", "Keep current"],
            ["correct", "Correct with incoming values and retain history"],
          ],
          box,
        );
        choice.value = decisions[c.key]?.choice || "";
        const reason = this.input(
          "Correction reason",
          decisions[c.key]?.reason || "",
          "text",
          box,
        );
        const review = this.check(
            "I reviewed the effect on withdrawal holds",
            box,
          ),
          reference = this.input(
            "Instruction evidence reference",
            decisions[c.key]?.holdReview?.instructionReference || "",
            "text",
            box,
          );
        review.checked = !!decisions[c.key]?.holdReview;
        const save = () => {
          decisions[c.key] = {
            choice: choice.value,
            reason: reason.value,
            holdReview: review.checked
              ? {
                  reviewedAt: new Date().toISOString(),
                  reviewedBy: "Local operator",
                  reason: reason.value,
                  instructionReference: reference.value,
                }
              : null,
          };
          invalidate();
        };
        choice.onchange =
          reason.oninput =
          review.onchange =
          reference.oninput =
            save;
      }
      for (const row of plan.rows) {
        const details = this.el("details", null, output);
        this.el(
          "summary",
          `${row.store} row ${row.row}: ${row.action}`,
          details,
        );
        this.el("pre", JSON.stringify(row.record, null, 2), details);
        if (row.action === "add" || row.action === "skip new row") {
          const skip = this.check(
              "Skip this incoming record (re-preview required)",
              details,
            ),
            key = `${row.store}:${row.record.id}`;
          skip.checked = decisions[key]?.choice === "skip";
          skip.onchange = () => {
            decisions[key] = { choice: skip.checked ? "skip" : "" };
            invalidate();
          };
        }
      }
      const mappingLinks = this.el("div", null, output);
      if (plan.generated.length)
        this.fileLinks(
          [
            {
              fileName: "generated-id-mapping.json",
              text: JSON.stringify(plan.generated, null, 2),
            },
          ],
          mappingLinks,
        );
      if (plan.health)
        this.el(
          "pre",
          "Prospective current holds and movement previews\n" +
            JSON.stringify(
              {
                counts: plan.health.counts,
                animals: plan.health.animals,
                departures: plan.departures,
              },
              null,
              2,
            ),
          output,
        );
      commit.disabled = !plan.ready;
    };
    this.button(
      "Preview / apply decisions and validate again",
      preview,
      section,
    );
    const confirmation = this.check(
      "I reviewed every staged row, conversion, duplicate, parentage and hold warning. Commit the complete import once.",
      section,
    );
    const commit = this.button(
      "Confirm atomic CSV import",
      async () => {
        this.saving = true;
        try {
          await commitCSV(this.repository(), plan, {
            confirmed: confirmation.checked,
            acknowledgeWarnings: confirmation.checked,
          });
          plan = null;
          await this.refresh();
          this.message("CSV import committed atomically.");
        } finally {
          this.saving = false;
        }
      },
      section,
    );
    commit.disabled = true;
    this.button(
      "Cancel import preview",
      () => {
        invalidate();
        output.replaceChildren();
        this.message("Import canceled. No records changed.");
      },
      section,
    );
    const advanced = this.el("details", null, section);
    this.el(
      "summary",
      "Advanced: restore a complete canonical CSV set",
      advanced,
    );
    this.el(
      "p",
      "Choose csv-manifest.json plus all 14 canonical tables together. This uses the same merge/replace preview, correction decisions and verified safety-backup gate as JSON restore. CSV has no source checksum.",
      advanced,
    );
    const full = this.input("Full CSV set and manifest", "", "file", advanced);
    full.multiple = true;
    this.button(
      "Prepare full-set restore",
      async () => {
        const contents = {};
        for (const f of full.files) contents[f.name] = await f.text();
        if (!contents["csv-manifest.json"])
          throw new Error("Select csv-manifest.json with all tables");
        const backup = await csvSetBackup(
          JSON.parse(contents["csv-manifest.json"]),
          contents,
        );
        await this.advancedRestore(backup);
      },
      advanced,
    );
  }
  guide() {
    const section = this.el("section");
    this.el("h2", "Switching away", section);
    this.el(
      "p",
      "Your records belong to you. There is no account to close or export fee. This guide is bundled locally and needs no remote page.",
      section,
    );
    const list = this.el("ol", null, section);
    for (const step of SWITCHING_STEPS) this.el("li", step, list);
    this.el(
      "p",
      "Back up before replacing a device, clearing browser storage, restore replacement, or schema upgrades. Local records are not application-encrypted. Device/profile access, private browsing, storage eviction and same-origin scripts can expose or remove records.",
      section,
    );
  }
}
