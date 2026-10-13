// SPDX-License-Identifier: AGPL-3.0-only
import { drawDashboard } from "./dashboard.js";
import { guideForm, pickerProgress } from "./guided-form.js";
import { HealthUI } from "./health-ui.js";
import { isHold } from "./withdrawal.js";
import { isUUID } from "./validation.js";
import {
  commitWorkflow,
  searchAnimals,
  events,
  adg,
  draftStore,
  EASE,
  DEPARTURE_NOTICE,
  farmDate,
} from "./workflows.js";
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const link = (text, hash) => {
  const a = el("a", text, "button secondary");
  a.href = hash;
  return a;
};
const button = (text, action) => {
  const b = el("button", text);
  b.type = "button";
  b.onclick = action;
  return b;
};
const opts = (values) => values.map((v) => (Array.isArray(v) ? v : [v, v]));
const sexes = ["unknown", "female", "male", "steer"];
const statuses = ["active", "sold", "culled", "dead", "archived"];
const names = {
  animals: "Animal identity",
  identifiers: "Identifier",
  memberships: "Group membership",
  calvings: "Calving",
  weights: "Weight",
  breedings: "Breeding",
  pregnancyChecks: "Pregnancy check",
  movements: "Movement",
  treatments: "Treatment",
  treatmentCourses: "Treatment course",
  revisions: "Correction",
  groups: "Group or pasture",
};
let sequence = 0;
function field(parent, name, labelText, value = "", config = {}) {
  const label = el("label", labelText);
  const control = el(
    config.options
      ? "select"
      : config.type === "textarea"
        ? "textarea"
        : "input",
  );
  control.name = name;
  control.id = `herd-field-${++sequence}`;
  label.htmlFor = control.id;
  if (config.options)
    for (const [value, text] of opts(config.options)) {
      const o = el("option", text);
      o.value = value;
      control.append(o);
    }
  else if (config.type !== "textarea") control.type = config.type || "text";
  if (config.type === "checkbox") {
    control.checked = !!value;
    label.className = "check";
  } else control.value = value ?? "";
  for (const key of [
    "required",
    "min",
    "max",
    "step",
    "inputMode",
    "placeholder",
  ])
    if (config[key] !== undefined) control[key] = config[key];
  label.append(control);
  parent.append(label);
  return control;
}
const values = (form) =>
  Object.fromEntries(
    [...form.elements]
      .filter((e) => e.name && !e.disabled)
      .map((e) => [e.name, e.type === "checkbox" ? e.checked : e.value]),
  );
const details = (title, text) => {
  const d = el("details");
  d.append(el("summary", title), el("pre", text));
  return d;
};
export class HerdUI {
  constructor(root, { repository, refresh, message, demo }) {
    this.root = root;
    this.demo = demo;
    this.health = new HealthUI(this, { el, link, button, field, details });
    this.repository = repository;
    this.refresh = refresh;
    this.message = message;
    this.filters = {};
    this.eventFilters = {};
    this.saving = false;
  }
  render(snapshot, route) {
    this.s = {
      ...snapshot,
      animals: [...snapshot.animals].sort(
        (a, b) => a.farmId.localeCompare(b.farmId) || a.id.localeCompare(b.id),
      ),
    };
    this.today = farmDate(snapshot.operation[0].timeZone);
    this.unit = snapshot.operation[0].weightUnit;
    this.root.replaceChildren();
    const [tab, id, action] = route.split("/");
    if (tab === "dashboard") {
      if (id === "quick") this.quick(action, route.split("/")[3]);
      else this.dashboard();
    }
    else if (tab === "health") this.health.route(id, action);
    else if (tab === "groups") id ? this.groupForm(id) : this.groups();
    else if (tab === "events") this.eventList();
    else if (tab === "animals") {
      if (id === "new") this.animalForm();
      else if (id === "batch") this.moveForm();
      else if (id) {
        const a = snapshot.animals.find((a) => a.id === id);
        if (!a) {
          this.root.append(
            el("p", "Animal not found. Return to Animals and reload records."),
          );
          return;
        }
        if (action === "treatment") this.health.treatment(a);
        else if (action === "edit") this.animalForm(a);
        else if (action === "calving") this.calvingForm(a);
        else if (action === "move") this.moveForm(a);
        else if (
          ["weight", "breeding", "pregnancy", "movement"].includes(action)
        )
          this.eventForm(a, action);
        else this.card(a);
      } else this.animals();
    }
    const heading = this.root.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
  title(text) {
    this.root.append(el("h1", text));
  }
  animalOptions(blank = "Unknown / external") {
    return [
      ["", blank],
      ...this.s.animals.map((a) => [
        a.id,
        `${a.farmId} · ${a.visualTag || "no tag"} · ${a.sex} · ${a.status}`,
      ]),
    ];
  }
  groupOptions(current) {
    return [
      ["", "No group"],
      ...this.s.groups
        .filter((g) => !g.archivedAt || g.id === current)
        .map((g) => [g.id, `${g.name}${g.archivedAt ? " (archived)" : ""}`]),
    ];
  }
  dashboard() {
    drawDashboard(this, { el, link, button, field });
  }
  quick(action, animalId) {
    if (action === "animal") this.animalForm();
    else {
      const animal = this.s.animals.find(a => a.id === animalId);
      if (!animal) {
        this.title(action === "calving" ? "Who is the mother?" : "Which animal?");
        if (action === "breeding") this.root.append(link("Record a pregnancy check", "#dashboard/quick/pregnancy"));
        const form = el("form", undefined, "card");
        let count=2;
        const first=this.s.animals.find(a=>a.status==='active');
        if(first){const originalRoot=this.root;const preview=el('div');this.root=preview;try{this.quick(action,first.id);count=preview.querySelector('.progress-dots').children.length;}finally{this.root=originalRoot;}}
        pickerProgress(form,count);
        const query = field(form, "query", "Type a tag or name", "", {type:"search"});
        const list = el("div", undefined, "animal-picker");
        const update = () => {
          list.replaceChildren();
          const result = searchAnimals(this.s, {query:query.value, pageSize:25});
          list.append(el("p", `${result.total} animals found. Showing up to 25. Type more to narrow the list.`));
          for (const a of result.rows) list.append(link(`${a.visualTag || a.farmId} · ${a.farmId}`, `#dashboard/quick/${action}/${a.id}`));
          if (!result.total) list.append(link("Add an animal first", "#dashboard/quick/animal"));
        };
        query.oninput = update;form.onsubmit=e=>e.preventDefault();form.append(list);this.root.append(form,link("Back to your herd", "#dashboard"));update();return;
      }
      if(action === "calving") this.calvingForm(animal);
      else if(action === "treatment") this.health.treatment(animal);
      else if(action === "move") this.moveForm(animal);
      else if(["weight","breeding","pregnancy","movement"].includes(action)) this.eventForm(animal,action);
    }
    const form=this.root.querySelector("form");
    if(form){
      const last = events(this.s,{type:"memberships",limit:1})[0]?.record;
      const group=form.elements.namedItem(action === "animal" ? "currentGroupId" : "groupId");
      if(group && last && [...group.options].some(o=>o.value===last.groupId))group.value=last.groupId;
      if(action === "breeding")form.elements.namedItem("serviceDate").value=this.today;
      guideForm(form, {selection:action!=="animal"});
    }
  }
  animals() {
    this.title("Animals");
    const actions = el("div", undefined, "actions");
    actions.append(
      link("Add animal", "#animals/new"),
      link("Groups and pastures", "#groups"),
      link("Batch move", "#animals/batch"),
      link("Batch treatment", "#health/batch"),
    );
    this.root.append(actions);
    const form = el("form", undefined, "card animal-filters");
    form.id = "animal-filter-panel";
    const count = Object.entries(this.filters).filter(
      ([key, value]) =>
        !["page", "asOf", "pageSize"].includes(key) &&
        value !== "" &&
        value !== false &&
        value !== undefined,
    ).length;
    const toggle = button(`Filters (${count})`, () => {
      this.filtersOpen = !this.filtersOpen;
      form.classList.toggle("filters-open", this.filtersOpen);
      toggle.setAttribute("aria-expanded", String(this.filtersOpen));
    });
    toggle.className = "filter-toggle";
    toggle.setAttribute("aria-controls", form.id);
    toggle.setAttribute("aria-expanded", String(!!this.filtersOpen));
    form.classList.toggle("filters-open", !!this.filtersOpen);
    this.root.append(toggle);
    const grid = el("div", undefined, "fields");
    form.append(grid);
    const f = this.filters;
    field(grid, "query", "Search farm ID, tags, RFID or notes", f.query, {
      type: "search",
    });
    field(grid, "status", "Status", f.status, {
      options: [["", "Active by default"], ...opts(statuses)],
    });
    field(
      grid,
      "includeInactive",
      "Include inactive animals",
      f.includeInactive,
      { type: "checkbox" },
    );
    field(grid, "sex", "Sex", f.sex, {
      options: [["", "All sexes"], ...opts(sexes)],
    });
    field(grid, "breed", "Breed", f.breed, {
      options: [
        ["", "All breeds"],
        ...[...new Set(this.s.animals.map((a) => a.breed).filter(Boolean))]
          .sort()
          .map((b) => [b, b]),
      ],
    });
    field(grid, "damId", "Dam", f.damId, {
      options: this.animalOptions("All dams"),
    });
    field(grid, "groupId", "Group / pasture", f.groupId, {
      options: [
        ["", "All groups"],
        ...this.s.groups.map((g) => [g.id, g.name]),
      ],
    });
    field(grid, "withdrawal", "Withdrawal state", f.withdrawal, {
      options: [
        ["", "All withdrawal states"],
        ["meat-hold", "Meat hold (includes review)"],
        ["milk-hold", "Milk hold (includes review)"],
        ["needs-review", "Needs review"],
        ["elapsed", "Recorded interval elapsed"],
        ["not-applicable", "Not applicable"],
        ["no-recorded-interval", "No recorded interval"],
      ],
    });
    field(grid, "birthFrom", "Born on or after", f.birthFrom, { type: "date" });
    field(grid, "birthTo", "Born on or before", f.birthTo, { type: "date" });
    field(grid, "minAgeDays", "Minimum age (calendar days)", f.minAgeDays, {
      type: "number",
      min: 0,
      inputMode: "numeric",
    });
    field(grid, "maxAgeDays", "Maximum age (calendar days)", f.maxAgeDays, {
      type: "number",
      min: 0,
      inputMode: "numeric",
    });
    const apply = el("button", "Apply filters");
    apply.type = "submit";
    form.append(
      apply,
      button("Clear filters", () => {
        this.filters = {};
        this.render(this.s, "animals");
      }),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      this.filters = { ...values(form), page: 1 };
      this.render(this.s, "animals");
    };
    this.root.append(form);
    const result = searchAnimals(this.s, { ...f, asOf: this.today });
    this.root.append(
      el(
        "p",
        `${result.total} matching of ${result.herdTotal} animals. Page ${result.page} of ${result.pages}. Age uses ${this.today}; unknown dates are excluded from date and age filters.`,
      ),
    );
    const list = el("ul", undefined, "rows");
    for (const a of result.rows) {
      const li = el("li", undefined, "row");
      li.append(
        link(
          `${a.visualTag || "No visual tag"} · ${a.farmId}`,
          `#animals/${a.id}`,
        ),
        el("p", `${a.sex} · ${a.breed || "Unknown breed"} · ${a.status}`),
        el(
          "p",
          `${this.s.groups.find((g) => g.id === a.currentGroupId)?.name || "No group"} · ${a.pasture || "No pasture text"}`,
        ),
      );
      list.append(li);
    }
    this.root.append(list);
    this.pages(result.page, result.pages, (page) => {
      this.filters.page = page;
      this.render(this.s, "animals");
    });
  }
  pages(page, pages, update) {
    const actions = el("div", undefined, "actions");
    const prev = button("Previous page", () => update(page - 1)),
      next = button("Next page", () => update(page + 1));
    prev.disabled = page <= 1;
    next.disabled = page >= pages;
    actions.append(prev, next);
    this.root.append(actions);
  }
  card(a) {
    this.recentAnimals = [a.id, ...(this.recentAnimals || []).filter(id => id !== a.id)].slice(0, 4);
    this.title(`${a.visualTag || "No visual tag"} · ${a.farmId}`);
    this.root.append(
      el("p", `${a.status} · ${a.sex} · ${a.breed || "Unknown breed"}`),
    );
    const actions = el("div", undefined, "actions");
    for (const [name, action] of [
      ["Add calf", "calving"],
      ["Weight", "weight"],
      ["Breeding", "breeding"],
      ["Move/Sale", "movement"],
      ["Move group", "move"],
      ["Pregnancy check", "pregnancy"],
      ["Edit / correct", "edit"],
    ])
      actions.append(link(name, `#animals/${a.id}/${action}`));
    actions.append(link("Treatment", `#animals/${a.id}/treatment`));
    this.root.append(actions);
    const identity = el("section", undefined, "card");
    identity.append(el("h2", "Identity and parentage"));
    const dl = el("dl");
    for (const [label, value] of [
      ["Farm ID", a.farmId],
      ["Visual tag", a.visualTag],
      ["RFID", a.rfid],
      ["DOB", `${a.birthDate || "Unknown"} (${a.birthDatePrecision})`],
      [
        "Dam",
        this.s.animals.find((x) => x.id === a.damId)?.farmId || a.damReference,
      ],
      [
        "Sire",
        this.s.animals.find((x) => x.id === a.sireId)?.farmId ||
          a.sireReference,
      ],
      ["Group", this.s.groups.find((g) => g.id === a.currentGroupId)?.name],
      ["Pasture", a.pasture],
      ["Notes", a.notes],
      ["Internal ID", a.id],
    ]) {
      dl.append(el("dt", label), el("dd", value || "Unknown"));
    }
    identity.append(dl);
    this.root.append(identity);
    this.health.mount(a.id);
    for (const c of this.s.treatmentCourses.filter(
      (c) => c.animalId === a.id && !c.voidedAt,
    ))
      this.root.append(
        link(
          `Review course: ${c.product} · ${c.state}`,
          `#health/course/${c.id}`,
        ),
      );
    this.root.append(el("h2", "Average daily gain"));
    const weights = this.s.weights
      .filter((w) => w.animalId === a.id && !w.voidedAt)
      .sort((a, b) => a.date.localeCompare(b.date));
    const controls = el("div", undefined, "fields");
    const options = [
      ["", "Choose measurement"],
      ...weights.map((w) => [
        w.id,
        `${w.date} · ${w.value} ${w.unit} · ${w.type}`,
      ]),
    ];
    const first = field(
        controls,
        "first",
        "First measurement",
        weights.at(-2)?.id,
        { options },
      ),
      second = field(
        controls,
        "second",
        "Second measurement",
        weights.at(-1)?.id,
        { options },
      ),
      unit = field(controls, "unit", "ADG unit", this.unit, {
        options: ["lb", "kg"],
      });
    const output = el("p");
    output.setAttribute("role", "status");
    const calc = () => {
      const r = adg(
        weights.find((w) => w.id === first.value),
        weights.find((w) => w.id === second.value),
        unit.value,
      );
      output.textContent = r.days
        ? `${r.text}. ${r.start.date}: ${r.start.value} ${r.start.unit} to ${r.end.date}: ${r.end.value} ${r.end.unit}; ${r.days} calendar days. Actual weights, no age adjustment.`
        : r.text;
    };
    for (const control of [first, second, unit]) control.onchange = calc;
    calc();
    this.root.append(controls, output);
    this.root.append(el("h2", "Full dated history"));
    this.history(events(this.s, { animalId: a.id }));
  }
  history(rows) {
    const list = el("ul", undefined, "rows");
    for (const e of rows) {
      const r = e.record,
        li = el("li", undefined, "card");
      const summary =
        e.store === "weights"
          ? `${r.type}: ${r.value} ${r.unit}`
          : e.store === "identifiers"
            ? `${r.type}: ${r.value} · ${r.validTo ? `former, ended ${r.validTo}` : "current"}`
            : e.store === "memberships"
              ? `${this.s.groups.find((g) => g.id === r.groupId)?.name || "Group"} · ${r.startDate} to ${r.endDate || "current"} · ${r.pastureSnapshot || ""}`
              : e.store === "calvings"
                ? `${r.calves.map((c) => `${this.s.animals.find((a) => a.id === c.calfId)?.farmId}: ${c.outcome}`).join(", ")} · Ease ${r.easeScore || "unknown"}`
                : e.store === "breedings"
                  ? `${r.method} · ${r.serviceDate || `${r.exposureStart} to ${r.exposureEnd || "ongoing"}`} · ${r.sireReference || this.s.animals.find((a) => a.id === r.sireId)?.farmId || "Unknown sire"}`
                  : e.store === "pregnancyChecks"
                    ? `${r.result} · ${r.method} · Due ${r.expectedCalvingDate || "unknown"}`
                    : e.store === "movements"
                      ? `${r.type} · ${r.source || r.destination || ""} · ${r.reason || ""}`
                      : e.store === "revisions"
                        ? `${names[r.entityType] || r.entityType}: ${r.reason}`
                        : r.farmId || r.name || r.product || "";
      li.append(
        el(
          "h3",
          `${e.date.slice(0, 10)} · ${names[e.store]}${r.voidedAt ? " · Voided" : ""}${r.archivedAt ? " · Archived" : ""}`,
        ),
        el("p", summary),
      );
      if (r.notes) li.append(el("p", r.notes));
      if (
        r.holdAcknowledgment &&
        [r.holdAcknowledgment.meatStatus, r.holdAcknowledgment.milkStatus].some(
          isHold,
        )
      ) {
        const warning = el("aside", undefined, "notice");
        warning.append(
          el("strong", "Departure recorded with holds/review"),
          el("p", r.holdAcknowledgment.text),
        );
        li.append(warning);
      }
      const links = el("div", undefined, "actions");
      for (const id of [...new Set(e.animalIds.filter(Boolean))]) {
        const a = this.s.animals.find((a) => a.id === id);
        if (a) links.append(link(a.farmId, `#animals/${id}`));
      }
      if(e.store === "treatments" && !r.voidedAt) links.append(link("Undo with reviewed evidence", `#health/void/${r.id}`));
      if(e.store === "animals") links.append(link("Correct animal", `#animals/${r.id}/edit`));
      li.append(links);
      li.append(
        details(
          "Complete record and original values",
          JSON.stringify(r, null, 2),
        ),
      );
      list.append(li);
    }
    if (!rows.length) list.append(el("li", "No events match."));
    this.root.append(list);
  }
  eventList() {
    this.title("Events");
    const form = el("form", undefined, "card fields");
    field(form, "type", "Event type", this.eventFilters.type, {
      options: [["", "All event types"], ...Object.entries(names)],
    });
    field(form, "from", "From date", this.eventFilters.from, { type: "date" });
    field(form, "to", "Through date", this.eventFilters.to, { type: "date" });
    const apply = el("button", "Apply filters");
    form.append(
      apply,
      button("Clear filters", () => {
        this.eventFilters = {};
        this.render(this.s, "events");
      }),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      this.eventFilters = values(form);
      this.render(this.s, "events");
    };
    this.root.append(form);
    const rows = events(this.s, this.eventFilters),
      pages = Math.max(1, Math.ceil(rows.length / 25)),
      page = Math.min(this.eventFilters.page || 1, pages);
    this.root.append(
      el(
        "p",
        `${rows.length} events, newest first. Page ${page} of ${pages}. Archived, voided and correction history are retained.`,
      ),
    );
    this.history(rows.slice((page - 1) * 25, page * 25));
    this.pages(page, pages, (page) => {
      this.eventFilters.page = page;
      this.render(this.s, "events");
    });
  }
  form(title, action, initial, back, { collect, draft, next } = {}) {
    this.title(title);
    const form = el("form", undefined, "card");
    const body = el("div", undefined, "fields");
    form.append(body);
    const status = el("p", "Not saved.");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.id = `form-status-${crypto.randomUUID()}`;
    form.setAttribute("aria-describedby", status.id);
    form.addEventListener(
      "invalid",
      (e) => {
        e.target.setAttribute("aria-invalid", "true");
        e.target.setAttribute("aria-describedby", status.id);
        status.textContent = `Check ${e.target.labels?.[0]?.textContent || "the highlighted field"}: ${e.target.validationMessage}`;
      },
      true,
    );
    form.addEventListener("input", (e) =>
      e.target.removeAttribute("aria-invalid"),
    );
    status.tabIndex = -1;
    const sticky = el("div", undefined, "sticky");
    sticky.append(status);
    const actions = el("div", undefined, "actions");
    const save = el("button", "Save");
    save.type = "submit";
    actions.append(save);
    if (next) {
      const b = el("button", "Save and next");
      b.type = "submit";
      b.value = "next";
      actions.append(b);
    }
    actions.append(link("Back", back));
    sticky.append(actions);
    form.append(sticky);
    this.root.append(form);
    const baseSnapshot = this.s;
    const entryRoute = location.hash;
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (this.saving) return;
      this.saving = true;
      status.textContent = "Saving…";
      const controls = [
        ...form.querySelectorAll("input,select,textarea,button"),
      ];
      let data,
        committed = false;
      try {
        data = { ...initial, ...values(form) };
        if (collect) data = collect(data);
        // Persist the delivery token and exact entry before beginning its atomic commit.
        if (draft) draft.save(data);
        controls.forEach((c) => (c.disabled = true));
        await commitWorkflow(this.repository(), baseSnapshot, action, data);
        committed = true;
        document.dispatchEvent(
          new document.defaultView.CustomEvent("herd-saved", {
            detail: { form },
          }),
        );
        let cleanup = "";
        if (draft)
          try {
            draft.clear();
          } catch {
            cleanup =
              " The committed draft could not be removed; it will be recognized on reopening.";
          }
        this.message(`Saved on this device.${cleanup}`);
        await this.refresh();
        const destination = e.submitter?.value === "next" && next ? next : back;
        if (location.hash === entryRoute) {
          if (location.hash === destination)
            this.render(this.s, destination.slice(1));
          else location.hash = destination;
        }
      } catch (error) {
        status.textContent = committed
          ? `Saved on this device, but the view could not refresh: ${error.message}. Reload before entering it again.`
          : `Not saved: ${error.message}`;
        this.message(status.textContent, true);
        for (const control of form.querySelectorAll("input,select,textarea"))
          control.setAttribute("aria-describedby", status.id);
        status.focus();
      } finally {
        this.saving = false;
        controls.forEach((c) => (c.disabled = false));
      }
    };
    return { form, body, status, sticky };
  }
  reviews(body, initial = {}) {
    const d = el("details");
    d.append(el("summary", "Review duplicate tags and parent sex"));
    const duplicates = this.s.identifiers.filter(
      (i) => i.type === "visual-tag" && !i.validTo && !i.voidedAt,
    );
    d.append(
      el(
        "p",
        "If validation flags duplicate tags or inconsistent parent sex, inspect these records before acknowledging. Farm IDs and RFID assignments must remain unique.",
      ),
    );
    d.append(
      details(
        "Current visual tags for comparison",
        duplicates
          .map(
            (i) =>
              `${i.value}: ${this.s.animals.find((a) => a.id === i.animalId)?.farmId}`,
          )
          .join("\n") || "No current tags.",
      ),
    );
    field(
      d,
      "acknowledgeDuplicateTags",
      "I reviewed duplicate current visual tags and intend to retain them.",
      initial.acknowledgeDuplicateTags,
      { type: "checkbox" },
    );
    field(
      d,
      "acknowledgeParentSex",
      "I reviewed inconsistent parent or breeding animal sex.",
      initial.acknowledgeParentSex,
      { type: "checkbox" },
    );
    body.append(d);
  }
  animalForm(a = {}) {
    const { body } = this.form(
      a.id ? `Correct ${a.farmId}` : "Add animal",
      "animal",
      a.id ? { id: a.id } : {},
      a.id ? `#animals/${a.id}` : "#animals",
      { next: a.id ? null : "#animals/new" },
    );
    field(body, "farmId", "Farm ID", a.farmId, { required: true });
    field(body, "visualTag", "Visual tag (text)", a.visualTag);
    field(body, "rfid", "RFID (text)", a.rfid);
    field(body, "breed", "Breed", a.breed);
    field(body, "sex", "Sex", a.sex || "unknown", { options: sexes });
    field(
      body,
      "birthDatePrecision",
      "DOB precision",
      a.birthDatePrecision || "unknown",
      { options: ["unknown", "exact", "estimated"] },
    );
    field(body, "birthDate", "Birth date (blank if unknown)", a.birthDate, {
      type: "date",
    });
    for (const parent of ["dam", "sire"]) {
      field(body, parent + "Id", `${parent} in herd`, a[parent + "Id"], {
        options: this.animalOptions(),
      });
      field(
        body,
        parent + "Reference",
        `External ${parent} reference (only without herd link)`,
        a[parent + "Reference"],
      );
    }
    field(body, "status", "Status", a.status || "active", {
      options: statuses,
    });
    field(body, "currentGroupId", "Group / pasture", a.currentGroupId, {
      options: this.groupOptions(a.currentGroupId),
    });
    field(body, "pasture", "Pasture text", a.pasture);
    field(
      body,
      "effectiveDate",
      "Effective date for identifiers and membership",
      this.today,
      { type: "date", required: true },
    );
    field(body, "notes", "Notes", a.notes, { type: "textarea" });
    if (
      a.id &&
      this.s.calvings.some((c) => c.calves.some((x) => x.calfId === a.id))
    )
      body.append(
        el(
          "p",
          "Changing birth date or parentage also corrects the linked delivery, any twin, and linked birth weights with this revision reason. Original event snapshots remain in history.",
        ),
      );
    if (a.id)
      field(body, "revisionReason", "Revision reason", "", { required: true });
    this.reviews(body);
  }
  groups() {
    this.title("Groups and pastures");
    this.root.append(
      link("Create group or pasture", "#groups/new"),
      link("Batch move", "#animals/batch"),
      link("Batch treatment", "#health/batch"),
    );
    for (const g of this.s.groups) {
      const card = el("section", undefined, "card");
      card.append(
        el("h2", g.name),
        el(
          "p",
          `${g.type} · ${g.archivedAt ? "Archived" : "Active"} · ${this.s.animals.filter((a) => a.currentGroupId === g.id && a.status === "active").length} active animals`,
        ),
        el("p", g.description || ""),
        link("Rename / archive", `#groups/${g.id}`),
      );
      this.root.append(card);
    }
  }
  groupForm(id) {
    const g = this.s.groups.find((g) => g.id === id) || {};
    const { body } = this.form(
      g.id ? `Edit ${g.name}` : "Create group or pasture",
      "group",
      g.id ? { id: g.id } : {},
      "#groups",
    );
    field(body, "name", "Name", g.name, { required: true });
    field(body, "type", "Type", g.type || "pasture", {
      options: ["pasture", "management-lot"],
    });
    field(body, "description", "Description", g.description, {
      type: "textarea",
    });
    if (g.id) {
      field(
        body,
        "archived",
        "Archive (retain memberships and history)",
        !!g.archivedAt,
        { type: "checkbox" },
      );
      field(body, "revisionReason", "Revision reason", "", { required: true });
    }
    this.reviews(body);
  }
  moveForm(a) {
    const { body } = this.form(
      a ? `Move ${a.farmId}` : "Batch move",
      "move",
      {},
      a ? `#animals/${a.id}` : "#animals",
      {
        collect: (data) => ({
          ...data,
          animalIds: a
            ? [a.id]
            : this.s.animals
                .filter((x) => data[`animal:${x.id}`])
                .map((x) => x.id),
        }),
      },
    );
    field(body, "groupId", "Destination group / pasture", "", {
      options: this.groupOptions(),
    });
    field(body, "pasture", "Pasture text", "");
    field(body, "date", "Move date", this.today, {
      type: "date",
      required: true,
    });
    field(body, "revisionReason", "Move reason", "", { required: true });
    if (!a) {
      const selections = el("fieldset");
      selections.append(el("legend", "Choose animals (includes inactive)"));
      for (const animal of this.s.animals)
        field(
          selections,
          `animal:${animal.id}`,
          `${animal.farmId} · ${animal.visualTag || "no tag"} · ${animal.status}`,
          false,
          { type: "checkbox" },
        );
      body.append(selections);
      const preview = el("p", "No animals selected.");
      selections.onchange = () => {
        const data = values(selections.closest("form"));
        preview.textContent =
          "Selected: " +
          (this.s.animals
            .filter((a) => data[`animal:${a.id}`])
            .map((a) => a.farmId)
            .join(", ") || "none");
      };
      body.append(preview);
    }
    this.reviews(body);
  }
  eventForm(a, action) {
    const titles = {
      weight: "Add weight",
      breeding: "Add breeding",
      pregnancy: "Pregnancy check",
      movement: "Move/Sale and source records",
    };
    const { body, form } = this.form(
      `${titles[action]} · ${a.farmId}`,
      action,
      { animalId: a.id },
      `#animals/${a.id}`,
      { next: `#animals/${a.id}/${action}` },
    );
    if (action !== "breeding")
      field(body, "date", "Event date", this.today, {
        type: "date",
        required: true,
      });
    if (action === "weight") {
      field(body, "type", "Weight type", "other", {
        options: ["birth", "weaning", "yearling", "other"],
      });
      field(body, "value", "Weight", "", {
        type: "number",
        step: "any",
        min: "0.000001",
        inputMode: "decimal",
        required: true,
      });
      field(body, "unit", "Unit", this.unit, { options: ["lb", "kg"] });
    }
    if (action === "breeding") {
      field(body, "method", "Method", "AI", { options: ["AI", "natural"] });
      field(body, "sireId", "Sire in herd", "", {
        options: this.animalOptions(),
      });
      field(body, "sireReference", "External sire / semen reference", "");
      field(
        body,
        "serviceDate",
        "Service date (AI or single natural service)",
        "",
        { type: "date" },
      );
      field(
        body,
        "exposureStart",
        "Exposure start (natural interval only)",
        "",
        { type: "date" },
      );
      field(body, "exposureEnd", "Exposure end (blank if ongoing)", "", {
        type: "date",
      });
    }
    if (action === "pregnancy") {
      field(body, "method", "Method", "unknown", {
        options: ["unknown", "ultrasound", "palpation", "blood", "other"],
      });
      field(body, "methodOther", "Other method (only for Other)", "");
      field(body, "result", "Result", "uncertain", {
        options: ["uncertain", "pregnant", "open"],
      });
      field(
        body,
        "estimatedGestationDays",
        "Estimated gestation days (pregnant only)",
        "",
        { type: "number", min: 0, inputMode: "numeric" },
      );
      field(
        body,
        "expectedCalvingDate",
        "Expected calving date (pregnant only)",
        "",
        { type: "date" },
      );
      field(body, "examiner", "Examiner", "");
      field(body, "breedingId", "Linked breeding", "", {
        options: [
          ["", "Unknown / unlinked"],
          ...this.s.breedings
            .filter((b) => b.damId === a.id && !b.voidedAt)
            .map((b) => [
              b.id,
              `${b.method} · ${b.serviceDate || b.exposureStart}`,
            ]),
        ],
      });
    }
    if (action === "movement") {
      body.append(
        link("Move between groups or pastures", `#animals/${a.id}/move`),
      );
      field(body, "type", "Movement type", "sale", {
        options: [
          "sale",
          "purchase",
          "cull-decision",
          "death",
          "other-departure",
        ],
      });
      field(body, "source", "Purchase / source", "");
      field(
        body,
        "destination",
        "Buyer / intended destination (or Unknown)",
        "",
      );
      field(body, "reason", "Decision / departure reason", "");
      field(body, "weightValue", "Optional movement weight", "", {
        type: "number",
        min: "0.000001",
        step: "any",
        inputMode: "decimal",
      });
      field(body, "weightUnit", "Weight unit (blank without weight)", "", {
        options: [
          ["", "No weight"],
          ["lb", "lb"],
          ["kg", "kg"],
        ],
      });
      field(body, "amount", "Sale amount (decimal text)", "", {
        inputMode: "decimal",
      });
      field(body, "currency", "Currency (3 letters, only with amount)", "");
      field(body, "receiptReference", "Receipt reference", "");
      body.append(el("p", DEPARTURE_NOTICE, "notice"));
      this.health.departure(body, form, a);
      field(
        body,
        "acknowledgeDeparture",
        "I reviewed this notice and original records. This acknowledgment does not authorize slaughter or milk sale. Required for departures.",
        false,
        { type: "checkbox" },
      );
    }
    field(body, "notes", "Notes (explain unknown source or destination)", "", {
      type: "textarea",
    });
    this.reviews(body);
  }
  calvingForm(dam) {
    let store,
      saved = null,
      loadError = "";
    const key = `calving:${dam.id}`;
    try {
      store = draftStore(localStorage, this.s.metadata[0].datasetId);
      saved = store.load(key);
      if (
        saved &&
        (!isUUID(saved.eventId) ||
          !Array.isArray(saved.calves) ||
          saved.calves.length < 1 ||
          saved.calves.length > 2 ||
          saved.calves.some((c) => !c || typeof c !== "object"))
      )
        throw new Error(
          "Unsupported calf draft. Discard it explicitly to begin again.",
        );
    } catch (e) {
      saved = null;
      loadError = e.message;
    }
    if (loadError) {
      this.title("Calf draft needs attention");
      this.root.append(
        el("p", loadError),
        link("Return to dam", `#animals/${dam.id}`),
        button("Discard unreadable draft and start again", () => {
          try {
            store.clear(key);
            this.render(this.s, `animals/${dam.id}/calving`);
          } catch (e) {
            this.message(e.message, true);
          }
        }),
      );
      return;
    }
    if (saved && this.s.calvings.some((c) => c.id === saved.eventId)) {
      this.title("Delivery already saved");
      this.root.append(
        el(
          "p",
          "The interrupted save completed. Its calves and weights are in the dam history.",
        ),
        link("Open dam history", `#animals/${dam.id}`),
        button("Start another delivery", () => {
          try {
            store.clear(key);
            this.render(this.s, `animals/${dam.id}/calving`);
          } catch (e) {
            this.message(e.message, true);
          }
        }),
      );
      return;
    }
    const initial = saved || {
      eventId: crypto.randomUUID(),
      birthDate: this.today,
      birthDatePrecision: "exact",
      calves: [{ sex: "unknown", outcome: "live", unit: this.unit }],
    };
    let calfCount = initial.calves?.length || 1;
    const collect = (data) => ({
      ...data,
      damId: dam.id,
      calves: Array.from({ length: calfCount }, (_, i) =>
        Object.fromEntries(
          ["farmId", "visualTag", "sex", "outcome", "weight", "unit"].map(
            (k) => [k, data[`calf${i}:${k}`]],
          ),
        ),
      ),
    });
    const draft = {
      save: (data) => {
        if (!store)
          throw new Error(
            "Local draft storage is unavailable. Enable browser storage before recording a calf.",
          );
        store.save(key, data);
      },
      clear: () => store.clear(key),
    };
    const { form, body, status } = this.form(
      `Add calf · Dam ${dam.farmId}`,
      "calving",
      { eventId: initial.eventId },
      `#animals/${dam.id}`,
      { collect, draft, next: `#animals/${dam.id}/calving` },
    );
    if (saved)
      status.textContent =
        "Recovered local draft. Review and confirm the birth date. Not committed.";
    if (loadError)
      status.textContent = `Draft recovery unavailable: ${loadError}`;
    field(body, "birthDate", "Birth date", initial.birthDate, {
      type: "date",
      required: true,
    });
    field(body, "dateConfirmed", "I confirm the birth date", false, {
      type: "checkbox",
      required: true,
    });
    field(
      body,
      "birthDatePrecision",
      "Date precision",
      initial.birthDatePrecision,
      { options: ["exact", "estimated"] },
    );
    const calfArea = el("div", undefined, "calf-area");
    body.append(calfArea);
    const addCalf = (i, data = {}) => {
      const fs = el("fieldset");
      fs.append(el("legend", `Calf ${i + 1}`));
      field(fs, `calf${i}:visualTag`, "Visual tag (text)", data.visualTag);
      field(fs, `calf${i}:sex`, "Sex", data.sex || "unknown", {
        options: sexes,
      });
      const more = el("details");
      more.open = !!saved;
      more.append(el("summary", "Identity, birth weight and outcome"));
      field(
        more,
        `calf${i}:farmId`,
        "Farm ID (blank generates a unique ID)",
        data.farmId,
      );
      field(more, `calf${i}:weight`, "Optional birth weight", data.weight, {
        type: "number",
        min: "0.000001",
        step: "any",
        inputMode: "decimal",
      });
      field(more, `calf${i}:unit`, "Weight unit", data.unit || this.unit, {
        options: ["lb", "kg"],
      });
      field(more, `calf${i}:outcome`, "Outcome", data.outcome || "live", {
        options: ["live", "stillborn", "died-after-birth", "unknown"],
      });
      fs.append(more);
      calfArea.append(fs);
    };
    initial.calves.forEach((c, i) => addCalf(i, c));
    const twin = button("Add twin to this delivery", () => {
      if (calfCount === 1) {
        calfCount = 2;
        addCalf(1);
        twin.disabled = true;
        persist();
        calfArea.lastElementChild.querySelector("input").focus();
      }
    });
    twin.disabled = calfCount === 2;
    body.append(twin);
    const more = el("details");
    more.append(el("summary", "Ease, sire and notes"));
    field(
      more,
      "easeScore",
      "Calving ease · local scale, no registry equivalence",
      initial.easeScore,
      { options: EASE },
    );
    field(more, "sireId", "Sire in herd", initial.sireId, {
      options: this.animalOptions(),
    });
    field(
      more,
      "sireReference",
      "External sire reference",
      initial.sireReference,
    );
    field(more, "notes", "Notes", initial.notes, { type: "textarea" });
    body.append(more);
    this.reviews(body, initial);
    const persist = () => {
      try {
        draft.save(collect({ eventId: initial.eventId, ...values(form) }));
        status.textContent =
          "Local draft retained. Not committed to herd records.";
      } catch (e) {
        status.textContent = `Draft not retained: ${e.message}`;
      }
    };
    form.addEventListener("input", persist);
    form.addEventListener("change", persist);
    body.append(
      button("Discard draft and start again", () => {
        try {
          draft.clear();
          this.render(this.s, `animals/${dam.id}/calving`);
        } catch (e) {
          status.textContent = e.message;
        }
      }),
    );
  }
}
