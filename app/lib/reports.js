import {plainOption,plainLabel,plainReason} from './copy.js';
import {humanWhen} from './when.js';
import {APP_ADDRESS} from './deploy-config.js';
import {savedCopyLine, shelfReport, calfSales} from './herd-stats.js';
import {drawWeightChart, weightPoints} from './chart.js';
// SPDX-License-Identifier: AGPL-3.0-only
import { evaluateWithdrawal, LABELS } from "./withdrawal.js";
import { events } from "./workflows.js";
import { isDate, requireThat as check } from "./validation.js";
export const PRINT_FOOTER =
  `Manley Farms Herd Records organizes user-entered records. This report is not veterinary, legal or regulatory advice, a compliance certificate, or authorization for slaughter or milk sale. Verify entries, withdrawal instructions and applicable requirements. This app is not certified by BQA or any authority. Provided as is, without warranty to the extent allowed by law. The user is responsible for decisions and backups. Full terms: ${APP_ADDRESS.replace(/^https:\/\//, "")}terms.txt.`;
export const PRINT_REPORTS = [
  ["treatments", "Treatment log for BQA preparation"],
  ["calvings", "Calving book"],
  ["animal", "Individual animal card"],
  ["herd-book", "Herd book"],
  ["open-cows", "Open cows"],
  ["expected-calving", "Expected calving"],
  ["cull-list", "Cull list"],
  ["barn-holds", "Barn hold sheet"],
  ["blank-chute", "Blank chute sheet"],
  ["blank-calving", "Blank calving sheet"],
  ["herd-numbers", "Herd numbers"],
  ["sales", "Calf sales"],
];
export const SWITCHING_STEPS = [
 'Save a copy and check it. Save all the tables and the field guide. Keep record links in the files.',
 'Print the treatment log and calf book. Check totals and some records. Check leading zeros, sold animals and holds that need review.',
 'Keep the files in two places outside this browser. Save a copy after herd work. Save tables every three months. Try a restore in a spare browser each year.',
 'Match fields in the new app. Add animals before their events. Check totals, parents, weights and wait instructions. Other apps may use different fields.',
 'Keep the original files, the app source and the guide. A helper can run that copy if this site closes. The guide explains how to host it and restore your herd. Opening the page as a file will not work.',
];
const identity = (a) =>
  a
    ? `${a.farmId} | tag ${a.visualTag ?? "Unknown"} | RFID ${a.rfid ?? "Unknown"}`
    : "Unknown";
const instruction = (r,zone) =>
  `${plainOption(r.state)}; ${r.value ?? "not known"} ${r.unit ? plainOption(r.unit) : ""}; from ${plainOption(r.source || "not known")}; ${r.instructionText ?? ""}; label or vet note: ${r.instructionReference ?? "not known"}; vet set end time: ${r.directedReleaseAt ? humanWhen(r.directedReleaseAt,zone) : "none"}; check notes: ${r.resolutionReason ?? "none"}`;
const hold = (h,zone) =>
  `${LABELS[h.status]}${h.releaseAt ? "; recorded wait ends " + humanWhen(h.releaseAt,zone) : ""}${h.reasons.length ? "; " + h.reasons.map(plainReason).join("; ") : ""}`;
export function assembleReport(
  s,
  {
    type = "treatments",
    from = "",
    to = "",
    season = "",
    animalId = "",
    unit = s.operation[0].weightUnit,
    groupId = "",
    now = new Date().toISOString(),
  } = {},
) {
  check(PRINT_REPORTS.some(([value]) => value === type), "Choose a report");
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
  const zone = s.operation[0].timeZone;
  const report = {
    type,
    title: PRINT_REPORTS.find(([value]) => value === type)[1],
    operation: s.operation[0].name,
    range: `${season ? season + ": " : ""}${from || "All dates"} to ${to || "today and saved future dates"}`,
    generatedAt: now,
    zone: s.operation[0].timeZone,
    unit,
    legend:
      "Unknown means not entered. Old and voided records stay here and are marked. A voided treatment does not count toward current holds. Recorded interval elapsed is not permission for slaughter or milk sale. Times show the clock used. Current holds use all saved records, even those outside these dates.",
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
          return `${k}: ${c ? hold(c,s.operation[0].timeZone) : "Voided, excluded from calculation"}`;
        })
        .join("\n");
      return {
        id: t.id,
        cells: [
          `${humanWhen(t.administrationAt || t.administrationDate,t.timeZone)}\n${t.administrationAt ? "Day and time known" : "Day only, needs a check"}\n${identity(t.snapshots.find((a) => a.animalId === t.animalId) || find(t.animalId))}`,
          `${t.product}\nLot: ${t.lot ?? "Unknown"}\nExpiry: ${t.expiryDate ?? "Unknown"}`,
          `Dose: ${t.doseValue ?? "Unknown"} ${t.doseUnit ?? ""}\nHow given: ${plainOption(t.route)} ${t.routeOther ?? ""}\nSite: ${t.injectionSite ?? "Unknown"}\nReason: ${t.reason}\nAdministrator: ${t.administrator ?? "Unknown"}\nVeterinarian: ${t.veterinarian ?? "Unknown"}`,
          `Meat: ${instruction(t.meat,s.operation[0].timeZone)}\nMilk: ${instruction(t.milk,s.operation[0].timeZone)}\nReference: ${t.instructionReference ?? "Unknown"}`,
          `${calculation}\nCourse: ${t.courseId ? "Linked doses" : "Single dose"}\nGroup treatment: ${t.batchId ? "Yes" : "No"}\nArchived: ${t.archivedAt ? humanWhen(t.archivedAt, zone) : "No"}; voided: ${t.voidedAt ? humanWhen(t.voidedAt, zone) : "No"}\nNotes: ${t.notes ?? ""}`,
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
            `${identity(calf)}\nSex: ${plainOption(calf.sex)}\nOutcome: ${plainOption(outcome.outcome)}`,
            weight(s.weights.find((w) => w.id === outcome.birthWeightId)),
            `Ease: ${c.easeScore ?? "Unknown"}\n${c.notes ?? ""}\nArchived: ${c.archivedAt ? humanWhen(c.archivedAt, zone) : "No"}; voided: ${c.voidedAt ? humanWhen(c.voidedAt, zone) : "No"}`,
          ],
        };
      }),
    );
    report.legend +=
      " Local ease scale: 1 unassisted, 2 easy assistance, 3 difficult assistance, 4 surgical delivery, 5 abnormal presentation; unknown is unrecorded. No registry equivalence.";
  } else if (type === "animal") {
    const a = find(animalId);
    check(a, "Choose an animal");
    report.animal = a;
    report.title += ": " + a.farmId;
    ids = new Set([a.id]);
    report.columns = ["Date / entity", "Saved record"];
    report.rows = [
      {
        id: a.id,
        cells: [
          "Current animal identity and parentage",
          recordWords(a, "", zone),
        ],
      },
      ...events(s, { animalId, from, to })
        .filter((e) => e.store !== "animals")
        .map((e) => ({
          id: `${e.store}:${e.record.id}`,
          cells: [
            `${e.date}\n${plainOption(e.store)}`,
            recordWords(e.record, "", zone) +
              (e.store === "weights"
                ? "\nDisplay weight: " + weight(e.record)
                : ""),
          ],
        })),
    ];
    const points = weightPoints((s.weights || []).filter((w) => w.animalId === a.id), unit);
    if (points.length) report.chartPoints = points;
    if ((s.calvings || []).some((c) => !c.voidedAt && c.damId === a.id)) {
      for (const line of calfSales(s, { from, to, damId: a.id }).lines) {
        report.rows.push({ id: `sales:${report.rows.length}`, cells: ["Calf sales", line] });
      }
    }
  } else {
    const shelf = shelfReport(s, { type, from, to, unit, now, groupId, season });
    check(shelf, "Choose a report");
    report.title = shelf.title;
    report.columns = shelf.columns;
    report.rows = shelf.rows;
    report.legend = shelf.legend;
    report.range = shelf.range;
    report.skipSafety = !!shelf.skipSafety;
    ids = new Set(shelf.animalIds || []);
  }
  report.holds = health.animals
    .filter((h) => ids.has(h.animal.id))
    .map((h) => ({
      identity: identity(h.animal),
      meat: hold(h.meat,s.operation[0].timeZone),
      milk: hold(h.milk,s.operation[0].timeZone),
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
  report.savedCopy = savedCopyLine(s);
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
      `${report.operation} | ${report.range} | Made ${humanWhen(report.generatedAt,report.zone)} | Weights in ${plainOption(report.unit)}. Dose and wait units are as entered. ${report.rows.length} rows.`,
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
  if (report.chartPoints) {
    root.append(el("h3", "Weight line"));
    const chart = el("div");
    chart.className = "weight-chart";
    chart.append(drawWeightChart(doc, report.chartPoints, report.unit));
    root.append(chart);
  }
  if (!report.skipSafety) {
    root.append(
      el(
        "h3",
        "Current holds use all saved records, not just these dates",
      ),
    );
    for (const h of report.holds)
      root.append(
        el(
          "p",
          `${h.identity}\nMeat: ${h.meat}\nMilk: ${h.milk}${h.departureAlert ? "\nDeparture warning: saved unresolved or historical holds." : ""}`,
        ),
      );
    root.append(el("h3", "Historical departure warnings"));
    for (const d of report.departures)
      root.append(
        el(
          "p",
          `${d.identity} | ${d.date} | Voided: ${d.voidedAt ?? "No"}\n${recordWords(d.acknowledgment, "", report.zone)}`,
        ),
      );
  }
  const footer = el("div");
  footer.className = "report-print-footer";
  footer.append(
    el(
      "p",
      `${report.operation} | ${report.title} | ${report.range} | ${humanWhen(report.generatedAt,report.zone)}`,
    ),
    el("p", report.savedCopy),
    el("p", report.footer),
  );
  root.append(footer);
}

function recordWords(value, prefix='', zone) {
 if(value===null || value===undefined)return 'Not known';
 if(typeof value!=='object')return typeof value==='boolean'?(value?'Yes':'No'):String(value);
 return Object.entries(value).filter(([key])=>!['id','animalId','damId','sireId','createdAt','updatedAt','revision','datasetId'].includes(key)).map(([key,v])=>{
  const name=plainLabel(key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase()));
  if(typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v))return `${name}: linked record`;
  if(typeof v==='string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v))return `${name}: ${humanWhen(v, zone)}`;
  if(key==='timeZone')return `${name}: ${v === 'Etc/UTC' ? 'World clock' : (v?.split('/').slice(1).join(', ').replaceAll('_',' ') || 'Not known')}`;
  return `${name}: ${typeof v==='object'?recordWords(v,name,zone):typeof v==='string'&&/^[a-z]+(?:-[a-z]+)*$/.test(v)?plainOption(v):recordWords(v)}`;
 }).join('\n');
}
