// SPDX-License-Identifier: AGPL-3.0-only
import { evaluateWithdrawal, LABELS } from "./withdrawal.js";
import { events } from "./workflows.js";
import { isDate, requireThat as check } from "./validation.js";
export const PRINT_FOOTER =
  "Manley Farms Herd Records organizes user-entered records. This report is not veterinary, legal or regulatory advice, a compliance certificate, or authorization for slaughter or milk sale. Verify entries, withdrawal instructions and applicable requirements. This app is not certified by BQA or any authority. Provided as is, without warranty to the extent allowed by law. The user is responsible for decisions and backups. Full terms: manleyfarms.com/tools/herd-records/terms/.";
export const SWITCHING_STEPS = [
  "Export and verify a full JSON backup. Export all CSV tables plus the field dictionary, retaining parent and event IDs.",
  "Print the current treatment log and calving book. Compare counts and sample records, including tags with leading zeros, sold animals, and unresolved holds.",
  "Copy files to a second user-controlled location outside this browser. Back up after each major work session, keep quarterly CSV archives, and practice a restore on a spare browser or profile at least yearly.",
  "Map fields into the destination system. Import animals before dependent events, and reconcile totals, parentage, weights, and withdrawal instructions. Vendor compatibility is not guaranteed.",
  "Keep the original exports and a runnable release archive with its manual. To self-host after the website disappears, serve that archive over HTTPS or localhost and restore JSON. Double-clicking a file:// page is not the supported PWA recovery method.",
];
const display = (v) =>
  v === null || v === undefined
    ? "Unknown"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
const identity = (a) =>
  a
    ? `${a.farmId} | tag ${a.visualTag ?? "Unknown"} | RFID ${a.rfid ?? "Unknown"}`
    : "Unknown";
const instruction = (r) =>
  `${r.state}; ${r.value ?? "unknown"} ${r.unit ?? ""}; source ${r.source ?? "unknown"}; ${r.instructionText ?? ""}; reference ${r.instructionReference ?? "unknown"}; directed release ${r.directedReleaseAt ?? "none"}; resolution ${r.resolutionReason ?? "none"}`;
const hold = (h) =>
  `${LABELS[h.status]}${h.releaseAt ? "; release UTC " + h.releaseAt : ""}${h.reasons.length ? "; " + h.reasons.join("; ") : ""}`;
export function assembleReport(
  s,
  {
    type = "treatments",
    from = "",
    to = "",
    season = "",
    animalId = "",
    unit = s.operation[0].weightUnit,
    now = new Date().toISOString(),
  } = {},
) {
  check(["treatments", "calvings", "animal"].includes(type), "Choose a report");
  check(["lb", "kg"].includes(unit), "Choose lb or kg");
  check(
    (!from || isDate(from)) &&
      (!to || isDate(to)) &&
      (!from || !to || from <= to),
    "Choose a valid inclusive date range",
  );
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const health = evaluateWithdrawal(s, { now }),
    find = (id) => s.animals.find((a) => a.id === id);
  const weight = (w) =>
    !w
      ? "Unknown"
      : `${(w.unit === unit ? w.value : unit === "kg" ? w.value * 0.45359237 : w.value / 0.45359237).toFixed(2)} ${unit} (entered ${w.value} ${w.unit})`;
  const report = {
    type,
    title:
      type === "treatments"
        ? "Treatment log for BQA preparation"
        : type === "calvings"
          ? "Calving book"
          : "Individual animal card",
    operation: s.operation[0].name,
    range: `${season ? season + ": " : ""}${from || "All dates"} to ${to || "present and retained future dates"}`,
    generatedAt: now,
    zone: s.operation[0].timeZone,
    unit,
    legend:
      "Unknown means not recorded. Archived and voided records are retained and labeled. Voided treatments do not contribute to current holds. Recorded interval elapsed is not permission for slaughter or milk sale. Releases are UTC instants; current holds use the entire retained history, regardless of report range.",
    footer: PRINT_FOOTER,
    rows: [],
    holds: [],
    departures: [],
  };
  let ids;
  if (type === "treatments") {
    report.columns = [
      "Date / time / identity",
      "Product / lot / expiry",
      "Administration",
      "Instructions",
      "Recorded calculation / history",
    ];
    const rows = s.treatments
      .filter((t) => inRange(t.administrationDate))
      .sort(
        (a, b) =>
          a.administrationDate.localeCompare(b.administrationDate) ||
          a.id.localeCompare(b.id),
      );
    report.rows = rows.map((t) => {
      const h = health.animals.find((h) => h.animal.id === t.animalId);
      const calculation = ["meat", "milk"]
        .map((k) => {
          const c = h[k].contributions.find((c) => c.treatment?.id === t.id);
          return `${k}: ${c ? hold(c) : "Voided, excluded from calculation"}`;
        })
        .join("\n");
      return {
        id: t.id,
        cells: [
          `${t.administrationDate}\n${t.administrationAt ?? "Date only, unresolved timing"}\n${t.enteredLocalTime ?? ""} ${t.timeZone ?? ""} offset ${t.offsetMinutes ?? "unknown"}\n${identity(t.snapshots.find((a) => a.animalId === t.animalId) || find(t.animalId))}`,
          `${t.product}\nLot: ${t.lot ?? "Unknown"}\nExpiry: ${t.expiryDate ?? "Unknown"}`,
          `Dose: ${t.doseValue ?? "Unknown"} ${t.doseUnit ?? ""}\nRoute: ${t.route} ${t.routeOther ?? ""}\nSite: ${t.injectionSite ?? "Unknown"}\nReason: ${t.reason}\nAdministrator: ${t.administrator ?? "Unknown"}\nVeterinarian: ${t.veterinarian ?? "Unknown"}`,
          `Meat: ${instruction(t.meat)}\nMilk: ${instruction(t.milk)}\nReference: ${t.instructionReference ?? "Unknown"}`,
          `${calculation}\nCourse: ${t.courseId ?? "Single dose"}\nBatch: ${t.batchId ?? "None"}\nArchived: ${t.archivedAt ?? "No"}; voided: ${t.voidedAt ?? "No"}\nNotes: ${t.notes ?? ""}\nID: ${t.id}`,
        ],
      };
    });
    // Holds outside the date filter are deliberately included as an explicit separate section.
    ids = new Set(s.animals.map((a) => a.id));
  } else if (type === "calvings") {
    report.columns = [
      "Birth / dam / sire",
      "Calf identity / sex / outcome",
      "Birth weight",
      "Ease / notes / history",
    ];
    const births = s.calvings
      .filter((c) => inRange(c.birthDate))
      .sort((a, b) => a.birthDate.localeCompare(b.birthDate));
    ids = new Set();
    report.rows = births.flatMap((c) =>
      c.calves.map((outcome) => {
        ids.add(c.damId);
        ids.add(outcome.calfId);
        if (c.sireId) ids.add(c.sireId);
        const calf = find(outcome.calfId);
        return {
          id: `${c.id}:${outcome.calfId}`,
          cells: [
            `${c.birthDate}\nDam: ${identity(find(c.damId))}\nSire: ${c.sireId ? identity(find(c.sireId)) : (c.sireReference ?? "Unknown")}`,
            `${identity(calf)}\nSex: ${calf.sex}\nOutcome: ${outcome.outcome}\nID: ${calf.id}`,
            weight(s.weights.find((w) => w.id === outcome.birthWeightId)),
            `Ease: ${c.easeScore ?? "Unknown"} (${c.easeScaleVersion})\n${c.notes ?? ""}\nArchived: ${c.archivedAt ?? "No"}; voided: ${c.voidedAt ?? "No"}\nDelivery ID: ${c.id}`,
          ],
        };
      }),
    );
    report.legend +=
      " Local ease scale: 1 unassisted, 2 easy assistance, 3 difficult assistance, 4 surgical delivery, 5 abnormal presentation; unknown is unrecorded. No registry equivalence.";
  } else {
    const a = find(animalId);
    check(a, "Choose an animal");
    report.animal = a;
    report.title += ": " + a.farmId;
    ids = new Set([a.id]);
    report.columns = ["Date / entity", "Retained record"];
    report.rows = [
      {
        id: a.id,
        cells: [
          "Current animal identity and parentage",
          JSON.stringify(a, null, 2),
        ],
      },
      ...events(s, { animalId, from, to })
        .filter((e) => e.store !== "animals")
        .map((e) => ({
          id: `${e.store}:${e.record.id}`,
          cells: [
            `${e.date}\n${e.store}`,
            JSON.stringify(e.record, null, 2) +
              (e.store === "weights"
                ? "\nDisplay weight: " + weight(e.record)
                : ""),
          ],
        })),
    ];
  }
  report.holds = health.animals
    .filter((h) => ids.has(h.animal.id))
    .map((h) => ({
      identity: identity(h.animal),
      meat: hold(h.meat),
      milk: hold(h.milk),
      departureAlert: h.departureAlert,
    }));
  report.departures = s.movements
    .filter((m) => ids.has(m.animalId) && m.holdAcknowledgment)
    .map((m) => ({
      identity: identity(find(m.animalId)),
      date: m.date,
      voidedAt: m.voidedAt,
      acknowledgment: m.holdAcknowledgment,
    }));
  return report;
}
export function renderReport(root, report) {
  const doc = root.ownerDocument,
    el = (tag, text) => {
      const n = doc.createElement(tag);
      if (text != null) n.textContent = text;
      return n;
    };
  root.replaceChildren();
  root.className = `report-preview ${report.type === "treatments" ? "landscape" : "portrait"}`;
  root.append(
    el("h2", report.title),
    el(
      "p",
      `${report.operation} | ${report.range} | Generated ${report.generatedAt} UTC | Farm zone ${report.zone} | Weights ${report.unit}; dose and withdrawal units as recorded | ${report.rows.length} report rows`,
    ),
    el("p", report.legend),
  );
  const table = el("table"),
    head = el("thead"),
    hr = el("tr");
  for (const c of report.columns) {
    const th = el("th", c);
    th.scope = "col";
    hr.append(th);
  }
  head.append(hr);
  table.append(head);
  const body = el("tbody");
  for (const row of report.rows) {
    const tr = el("tr");
    for (const c of row.cells) tr.append(el("td", c));
    body.append(tr);
  }
  table.append(body);
  root.append(table);
  if (!report.rows.length) root.append(el("p", "No records in this range."));
  root.append(
    el(
      "h3",
      "Current holds from all retained history, independent of selected range",
    ),
  );
  for (const h of report.holds)
    root.append(
      el(
        "p",
        `${h.identity}\nMeat: ${h.meat}\nMilk: ${h.milk}${h.departureAlert ? "\nDeparture warning: retained unresolved or historical holds." : ""}`,
      ),
    );
  root.append(el("h3", "Historical departure warnings"));
  for (const d of report.departures)
    root.append(
      el(
        "p",
        `${d.identity} | ${d.date} | Voided: ${d.voidedAt ?? "No"}\n${JSON.stringify(d.acknowledgment)}`,
      ),
    );
  const footer = el("div");
  footer.className = "report-print-footer";
  footer.append(
    el(
      "p",
      `${report.operation} | ${report.title} | ${report.range} | ${report.generatedAt} UTC | ${report.zone}`,
    ),
    el("p", report.footer),
  );
  root.append(footer);
}
