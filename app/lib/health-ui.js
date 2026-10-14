import {plainReason} from './copy.js';
import {setupTime} from './when.js';
import {humanWhen} from './when.js';
// SPDX-License-Identifier: AGPL-3.0-only
import {
  evaluateWithdrawal,
  isHold,
  DASHBOARD_NOTICE,
  departurePreview,
  departureText,
  localParts,
} from "./withdrawal.js";
export class HealthUI {
  constructor(host, helpers) {
    this.host = host;
    Object.assign(this, helpers);
  }
  get s() {
    return this.host.s;
  }
  format(instant) {
    return instant ? humanWhen(instant,this.s.operation[0].timeZone) : "No set end time";
  }
  summary(c) {
    return `${c.label}${c.reasons.length ? `: ${c.reasons.map(plainReason).join("; ")}` : ""} · ${this.format(c.releaseAt)}${c.remaining ? ` · ${c.remaining} remaining` : ""}`;
  }
  mount(animalId) {
    const section = this.el("section", undefined, "withdrawal-panel");
    section.dataset.animalId = animalId || "";
    section.setAttribute("aria-live", "off");
    this.host.root.append(section);
    this.update(section);
  }
  update(section, now = new Date().toISOString()) {
    const { el, link, details } = this;
    const open = new Set(
      [...section.querySelectorAll("details[open]")].map((d) => d.dataset.key),
    );
    const evaluation = evaluateWithdrawal(this.s, { now });
    const pageRows = (rows, key, parent = section) => {
      section.pages ||= {};
      const pages = Math.max(1, Math.ceil(rows.length / 25));
      const page = Math.min(section.pages[key] || 1, pages);
      section.pages[key] = page;
      if (rows.length > 25) {
        const navigation = el("div", undefined, "actions");
        const label = el(
          "span",
          `${key}: ${rows.length} animals, page ${page} of ${pages}`,
        );
        label.tabIndex = -1;
        label.dataset.pageLabel = key;
        navigation.append(label);
        for (const [text, delta] of [
          ["Previous", -1],
          ["Next", 1],
        ]) {
          const b = this.button(`${text} ${key.toLowerCase()} page`, () => {
            section.pages[key] = page + delta;
            this.update(section, now);
            [...section.querySelectorAll("[data-page-label]")]
              .find((n) => n.dataset.pageLabel === key)
              ?.focus();
          });
          b.disabled = page + delta < 1 || page + delta > pages;
          navigation.append(b);
        }
        parent.append(navigation);
      }
      return rows.slice((page - 1) * 25, page * 25);
    };
    const animalId = section.dataset.animalId;
    section.replaceChildren();
    if (!animalId) {
      const counts = el("div", undefined, "stats");
      for (const [label, count] of [
        ["Meat hold", evaluation.counts.meat],
        ["Milk hold", evaluation.counts.milk],
        ["Needs review", evaluation.counts.review],
      ]) {
        const card = el("div", undefined, "stat");
        card.append(el("strong", count), el("span", label));
        counts.append(card);
      }
      section.append(
        counts,
        el(
          "p",
          "An animal can be in more than one count. Sold and archived animals are counted too.",
        ),
      );
    }
    section.append(
      this.safetyNote(),
      el(
        "p",
        `Checked ${this.format(evaluation.calculatedAt)}. Uses this phone’s clock. No alerts while the app is closed.`,
      ),
      link("Terms and disclaimer", "#terms"),
    );
    if (evaluation.clockReviewRequired)
      section.append(
        el(
          "p",
          "Device clock moved backward. Check the clock and record a review. Applicable intervals need review until then.",
          "notice",
        ),
        link("Review device clock", "#health/clock"),
      );
    const rows = animalId
      ? evaluation.animals.filter((r) => r.animal.id === animalId)
      : evaluation.animals;
    const categories = animalId
      ? [["Recorded withdrawals", () => true]]
      : [
          ["Meat hold", (r) => isHold(r.meat.status)],
          ["Milk hold", (r) => isHold(r.milk.status)],
          ["Needs review", (r) => r.needsReview],
        ];
    for (const [category, include] of categories) {
      section.append(el("h2", category));
      const matching = rows.filter(include);
      if (!matching.length)
        section.append(el("p", "No animals in this category."));
      for (const row of pageRows(matching, category)) {
        const a = row.animal,
          card = el("article", undefined, "card");
        card.append(
          link(`${a.visualTag || "No tag"} · ${a.farmId}`, `#animals/${a.id}`),
          el(
            "p",
            `${this.s.groups.find((g) => g.id === a.currentGroupId)?.name || "No group"} · ${a.pasture || "No pasture text"} · ${a.status[0].toUpperCase()+a.status.slice(1)}`,
          ),
        );
        const commodities =
          category === "Meat hold"
            ? ["meat"]
            : category === "Milk hold"
              ? ["milk"]
              : ["meat", "milk"];
        for (const commodity of commodities) {
          const c = row[commodity];
          const treatments = c.contributions
            .map((x) => x.treatment)
            .filter(Boolean);
          const last = treatments
            .map((t) => t.administrationAt || t.administrationDate)
            .sort()
            .at(-1);
          card.append(
            el("h3", `${commodity}: ${this.summary(c)}`),
            el(
              "p",
              `Product: ${[...new Set(treatments.map((t) => t.product))].join(", ") || "No dose marked done"}. Last dose: ${last ? humanWhen(last,this.s.operation[0].timeZone) : "Not known"}`,
            ),
          );
          const expanded = el("details");
          expanded.dataset.key = `${category}:${a.id}:${commodity}`;
          expanded.open = open.has(expanded.dataset.key);
          expanded.append(el("summary", "Contributing treatments"));
          for (const item of c.contributions) {
            const t = item.treatment;
            expanded.append(
              el(
                "p",
                `${t?.product || item.course?.product} · ${t ? humanWhen(t.administrationAt || t.administrationDate,this.s.operation[0].timeZone) : "No dose"} · ${this.summary(item)}`,
              ),
            );
            if (t)
              expanded.append(
                link("Correct / void treatment", `#health/treatment/${t.id}`),
                details(
                  "For helpers: saved instructions and time",
                  JSON.stringify(t, null, 2),
                ),
              );
          }
          card.append(expanded);
        }
        if (row.departureAlert)
          card.append(
            el("p", "Departure recorded with holds/review", "notice"),
          );
        section.append(card);
      }
    }
    if (!animalId) {
      const alerts = rows.filter((r) => r.departureAlert);
      if (alerts.length) {
        section.append(el("h2", "Departure alerts"));
        for (const r of pageRows(alerts, "Departure alerts"))
          section.append(
            link(
              `${r.animal.farmId}: Departure recorded with holds/review`,
              `#animals/${r.animal.id}`,
            ),
          );
      }
      const elapsed = rows.filter((r) =>
        [r.meat.status, r.milk.status].includes("elapsed"),
      );
      const d = el("details");
      d.dataset.key = "elapsed";
      d.open = open.has("elapsed");
      d.append(el("summary", "Recorded interval elapsed"));
      for (const r of pageRows(elapsed, "Recorded interval elapsed", d))
        d.append(
          link(
            `${r.animal.farmId} · Meat: ${r.meat.label} · Milk: ${r.milk.label}`,
            `#animals/${r.animal.id}`,
          ),
        );
      section.append(d);
    }
  }
  safetyNote(){
    const box=this.el('div',undefined,'notice');box.append(this.el('p','A finished wait is not a safe-to-sell check. Follow the label and your vet.'));
    const why=this.el('details');why.append(this.el('summary','Why?'),this.el('p',DASHBOARD_NOTICE));box.append(why);return box;
  }
  reviewFields(body) {
    this.field(body, "revisionReason", "Correction / review reason", "", {
      required: true,
    });
    this.field(body, "reviewedBy", "Reviewed by", "", { required: true });
    this.field(
      body,
      "reviewReference",
      "Instruction / evidence reference",
      "",
      { required: true },
    );
    this.field(
      body,
      "reviewConfirmed",
      "I checked the old answers, instructions and how holds will change",
      false,
      { type: "checkbox", required: true },
    );
  }
  treatment(animal, prior) {
    const { field, el } = this,
      h = this.host;
    const batch = !animal && !prior;
    const { body, form } = h.form(
      prior
        ? "Correct treatment"
        : batch
          ? "Batch treatment"
          : `Treatment · ${animal.farmId}`,
      batch ? "batch-treatment" : "treatment",
      prior ? { id: prior.id } : animal ? { animalId: animal.id } : {},
      animal ? `#animals/${animal.id}` : "#animals",
      {
        collect: (data) => ({
          ...data,
          ...(batch
            ? {
                animalIds: this.s.animals
                  .filter((a) => data[`animal:${a.id}`])
                  .map((a) => a.id),
              }
            : {}),
        }),
      },
    );
    form.dataset.animalName=animal?.farmId || "your selected animals";
    const t = prior || {};
    if (batch) {
      const choices = el("fieldset");
      choices.append(el("legend", "Select animals"));
      for (const a of this.s.animals)
        field(
          choices,
          `animal:${a.id}`,
          `${a.farmId} · ${a.visualTag || "No tag"} · ${a.status[0].toUpperCase()+a.status.slice(1)}`,
          false,
          { type: "checkbox" },
        );
      const preview = el("p", "Selected: none");
      const confirm = field(
        body,
        "batchConfirmed",
        "I reviewed the selected animals for this batch",
        false,
        { type: "checkbox", required: true },
      );
      choices.onchange = () => {
        confirm.checked = false;
        preview.textContent =
          "Selected: " +
          (this.s.animals
            .filter((a) => form.elements.namedItem(`animal:${a.id}`).checked)
            .map((a) => a.farmId)
            .join(", ") || "none");
      };
      body.append(choices, preview);
    }
    field(
      body,
      "administrationPrecision",
      "Administration precision",
      t.administrationPrecision || "instant",
      { options: ["instant", "date-only"] },
    );
    field(
      body,
      "administrationDate",
      "Administration date",
      t.administrationDate || h.today,
      { type: "date", required: true },
    );
    field(
      body,
      "enteredLocalTime",
      "Entered local date and time (timed records)",
      t.enteredLocalTime,
      { type: "datetime-local", step: "1" },
    );
    field(
      body,
      "timeZone",
      "Original time zone",
      t.timeZone || this.s.operation[0].timeZone,
      { required: true },
    );
    field(
      body,
      "offsetMinutes",
      "UTC offset in minutes (local minus UTC; choose explicitly, e.g. -420 or -480)",
      t.offsetMinutes,
      { type: "number", min: -840, max: 840, step: 1 },
    );
    body.append(
      this.details(
        "Why does the time matter?",
        "A day without a time needs a check. Some clock times happen twice. Choose the first or second time. You cannot record a future dose as done.",
      ),
    );
    for (const [name, label] of [
      ["product", "Product / vaccine"],
      ["lot", "Lot / serial"],
      ["expiryDate", "Expiry, if available"],
      ["doseValue", "Dose (blank only with unknown explanation in notes)"],
      ["doseUnit", "Dose unit"],
      ["injectionSite", "Injection site"],
      ["reason", "Reason"],
      ["administrator", "Administrator"],
      ["veterinarian", "Veterinarian"],
      ["instructionReference", "Label or veterinarian instruction reference"],
    ])
      field(body, name, label, t[name], {
        ...(name === "expiryDate"
          ? { type: "date" }
          : name === "doseValue"
            ? {
                type: "number",
                min: "0.000001",
                step: "any",
                inputMode: "decimal",
              }
            : {}),
        required: [
          "product",
          "reason",
          "administrator",
          "instructionReference",
        ].includes(name),
      });
    field(body, "route", "Route", t.route || "unknown", {
      options: [
        "unknown",
        "IM",
        "SC",
        "IV",
        "oral",
        "topical",
        "intranasal",
        "other",
      ],
    });
    field(body, "routeOther", "Other route (only when Other)", t.routeOther);
    field(
      body,
      "courseId",
      "Existing course (same animal and product)",
      t.courseId,
      {
        options: [
          ["", "Single administration"],
          ...this.s.treatmentCourses
            .filter((c) => !c.voidedAt && c.animalId === animal?.id)
            .map((c) => [c.id, `${c.product} · ${c.state}`]),
        ],
      },
    );
    if (!prior)
      field(
        body,
        "newCourse",
        "Start an open course for each selected animal",
        false,
        { type: "checkbox" },
      );
    for (const commodity of ["meat", "milk"]) {
      const fs = el("fieldset");
      fs.append(el("legend", `${commodity} instructions`));
      fs.append(
        el(
          "p",
          "Pick Needs a vet check if the instructions conflict or use milkings. Write the full instructions. Do not guess hours.",
        ),
      );
      const r = t[commodity] || {};
      field(
        fs,
        `${commodity}:state`,
        "Rule state (required; blank is not zero)",
        r.state,
        {
          options: [
            ["", "Choose explicitly"],
            "duration",
            "unknown",
            "not-applicable",
            "prohibited",
            "manual-review",
          ],
          required: true,
        },
      );
      field(fs, `${commodity}:value`, "Entered interval", r.value, {
        type: "number",
        min: 0,
        step: "any",
        inputMode: "decimal",
      });
      field(fs, `${commodity}:unit`, "Interval unit", r.unit || "hours", {
        options: ["hours", "days"],
      });
      field(
        fs,
        `${commodity}:zeroConfirmed`,
        "I confirm the instructions explicitly specify zero",
        false,
        { type: "checkbox" },
      );
      field(fs, `${commodity}:source`, "Instruction source", r.source, {
        options: [["", "Unknown"], "label", "vet"],
      });
      field(
        fs,
        `${commodity}:instructionReference`,
        "Instruction reference",
        r.instructionReference,
      );
      field(
        fs,
        `${commodity}:instructionText`,
        "Instructions / conditions (milk not applicable means no marketed milk)",
        r.instructionText,
        { type: "textarea" },
      );
      const directed = el("details");
      directed.append(
        el(
          "summary",
          "Record the end time your vet has checked",
        ),
      );
      for (const [key, label] of [
        ["directedReleaseAt", "Directed release UTC (ISO timestamp with Z)"],
        [
          "resolutionReason",
          "Resolution reason, including how unknown timing was addressed",
        ],
        ["resolvedAt", "Resolution recorded UTC (ISO timestamp with Z)"],
        ["resolvedBy", "Resolution recorded by"],
      ])
        field(directed, `${commodity}:${key}`, label, r[key]);
      fs.append(directed);
      body.append(fs);
    }
    field(body, "notes", "Notes / unknown dose explanation", t.notes, {
      type: "textarea",
    });
    if (prior) {
      body.append(
        this.details(
          "For helpers: earlier answers stay in history",
          JSON.stringify(prior, null, 2),
        ),
      );
      this.reviewFields(body);
      body.append(
        this.link("Void with reviewed evidence", `#health/void/${prior.id}`),
      );
    }
    h.reviews(body);
    setupTime(form,{preserve:!!prior});
  }
  route(kind, id) {
    const h = this.host;
    if (kind === "batch") return this.treatment();
    if (kind === "clock") {
      const { body } = h.form(
        "Review device clock",
        "clock-review",
        {},
        "#dashboard",
      );
      body.append(
        this.el(
          "p",
          "Check this phone’s date, time and clock setting. Only then confirm the clock check.",
        ),
      );
      this.field(body, "revisionReason", "Clock review reason", "", {
        required: true,
      });
      this.field(
        body,
        "reviewConfirmed",
        "I checked the device clock and confirm this reviewed reset",
        false,
        { type: "checkbox", required: true },
      );
      return;
    }
    if (kind === "course") {
      const c = this.s.treatmentCourses.find((c) => c.id === id);
      if (!c) {
        h.title("Course not found");
        return;
      }
      const { body } = h.form(
        `Review course · ${c.product}`,
        "course",
        { id },
        `#animals/${c.animalId}`,
      );
      this.field(body, "state", "Course state", c.state, {
        options: ["open", "closed"],
      });
      this.field(
        body,
        "finalAdministrationId",
        "Final completed administration (must be latest)",
        c.finalAdministrationId,
        {
          options: [
            ["", "No final administration"],
            ...this.s.treatments
              .filter((t) => t.courseId === id && !t.voidedAt)
              .map((t) => [
                t.id,
                `${t.administrationAt || t.administrationDate} · ${t.product}`,
              ]),
          ],
        },
      );
      this.field(
        body,
        "instructionReference",
        "Course instruction reference",
        c.instructionReference,
      );
      this.field(body, "notes", "Notes", c.notes, { type: "textarea" });
      this.reviewFields(body);
      return;
    }
    const t = this.s.treatments.find((t) => t.id === id);
    if (!t || t.voidedAt) {
      h.title("Treatment unavailable for correction");
      return;
    }
    if (kind === "void") {
      const { body } = h.form(
        "Void treatment with review",
        "treatment-void",
        { id },
        `#animals/${t.animalId}`,
      );
      body.append(
        this.el(
          "p",
          "The original record stays in history. Voiding a final administration reopens its course.",
        ),
        this.details("For helpers: original treatment", JSON.stringify(t, null, 2)),
      );
      this.reviewFields(body);
      return;
    }
    this.treatment(
      this.s.animals.find((a) => a.id === t.animalId),
      t,
    );
  }
  departure(body, form, animal) {
    const panel = this.el("section", undefined, "departure-preview");
    let previous;
    const update = () => {
      panel.replaceChildren();
      const date = form.elements.namedItem("date").value;
      try {
        const preview = departurePreview(
          this.s,
          animal.id,
          date,
          new Date().toISOString(),
        );
        const signature = JSON.stringify([
          date,
          preview.event.meat,
          preview.event.milk,
          preview.current.meat.status,
          preview.current.milk.status,
        ]);
        if (previous !== signature) {
          const ack = form.elements.namedItem("acknowledgeDeparture");
          if (ack) ack.checked = false;
        }
        previous = signature;
        panel.append(
          this.el("h2", "Departure withdrawal preview"),
          this.el("p", "Check meat and milk for the move day and for now. Check the records behind each result. Recording a move does not permit slaughter or milk sale."),
        );
        for (const [label, row] of [
          ["Event-time", preview.event],
          ["Current", preview.current],
        ])
          for (const commodity of ["meat", "milk"]) {
            panel.append(
              this.el(
                "p",
                `${label} ${commodity}: ${this.summary(row[commodity])}`,
              ),
            );
            for (const c of row[commodity].contributions)
              panel.append(
                this.el(
                  "p",
                  `${c.treatment?.product || c.course?.product}: ${this.summary(c)}`,
                ),
              );
          }
      } catch (e) {
        panel.append(this.el("p", e.message));
      }
    };
    panel.refreshPreview = update;
    form.elements.namedItem("date").addEventListener("change", update);
    body.append(panel);
    update();
  }
}
