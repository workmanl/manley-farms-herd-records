import {plainOption, plainLabel, entryError} from './copy.js';
import {rememberTreatment, treatmentTools} from './last-used.js';
// SPDX-License-Identifier: AGPL-3.0-only
import { drawDashboard } from "./dashboard.js";
import { guideForm, pickerProgress } from "./guided-form.js";
import { HealthUI } from "./health-ui.js";
import { isHold, evaluateWithdrawal } from "./withdrawal.js";
import { icon } from "./icons.js";
import { isUUID } from "./validation.js";
import { dueRows, dueThisMonth, expectedFromDays } from "./calendar.js";
import { pedigreeView } from "./pedigree.js";
import { drawWeightChart, groupGain, weightPoints } from "./chart.js";
import { chuteSaleInput, chuteWeightInput } from "./chute.js";
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
const familyLink = (cell) => {
  if (!cell.href) return el("span", cell.name);
  const a = el("a", cell.name, "row-link");
  a.href = cell.href;
  return a;
};
const button = (text, action) => {
  const b = el("button", text);
  b.type = "button";
  b.onclick = action;
  return b;
};
const safeDeviceStorage = () => {try{return document.defaultView.localStorage;}catch{return undefined;}};
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
  if(name === 'timeZone')config={...config,options:[...new Set([value,'Etc/UTC',...(Intl.supportedValuesOf?.('timeZone') || [])])].filter(Boolean).map(z=>[z,z==='Etc/UTC'?'World clock':z.split('/').slice(1).join(', ').replaceAll('_',' ')])};
  const label = el("label", plainLabel(labelText));
  const control = el(
    config.options
      ? "select"
      : config.type === "textarea"
        ? "textarea"
        : "input",
  );
  if (!config.options && ["textarea", "text", "search", undefined].includes(config.type)) control.maxLength = 10000;
  control.name = name;
  control.id = `herd-field-${++sequence}`;
  label.htmlFor = control.id;
  if (config.options)
    for (const [value, text] of opts(config.options)) {
      const o = el("option", text !== value && Array.isArray(config.options?.find(v=>Array.isArray(v)&&v[0]===value)) ? text : plainOption(text));
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
      .map((e) => [e.name, e.type === "checkbox" ? e.checked : e.type === "datetime-local" ? e.value.replace(/\.\d+$/, "") : e.value]),
  );
const details = (title, text) => {
  const d = el("details");
  d.append(el("summary", title), el("pre", text));
  return d;
};
export class HerdUI {
  constructor(root, { repository, refresh, message, demo, backupPanel }) {
    this.root = root;
    this.demo = demo;
    this.backupPanel = backupPanel;
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
    if (this.repository().moved && (
      (tab === 'dashboard' && id) ||
      (tab === 'animals' && (['new','batch','chute'].includes(id) || action)) ||
      (tab === 'groups' && id) || (tab === 'health' && id)
    )) {
      this.title('Add new records at the new address');
      this.root.append(el('p','This old address is read-only. Save a copy, then restore it at herd.manleyfarms.com.'), link('View your herd','#dashboard'));
      return;
    }
    if (tab === "add") { this.title("Add a record"); const grid=el("div",undefined,"quick-actions"); for(const [kind,label,glyph] of [["animal","Add an animal","plus"],["calving","Add a calf","calf"],["weight","Weigh","weight"],["treatment","Record a treatment","health"],["move","Move to a pasture or group","move"],["breeding","Breeding","breed"],["pregnancy","Pregnancy check","calendar"],["movement","Sold or died","sale"]]){const a=link("",`#dashboard/quick/${kind}`);a.className="button secondary quick-action";a.setAttribute("aria-label",label);a.append(icon(glyph),el("span",label));grid.append(a);} this.root.append(grid); const group=link("Work a group","#animals/chute");group.className="button secondary";group.prepend(icon("group"));this.root.append(group); }
    else if (tab === "dashboard") {
      if (id === "quick") this.quick(action, route.split("/")[3]);
      else this.dashboard();
      if (this.repository().moved) this.root.prepend(el('p','This old address is read-only. Save a copy, then add new records at herd.manleyfarms.com.','notice'));
    }
    else if (tab === "health") this.health.route(id, action);
    else if (tab === "groups") id ? this.groupForm(id) : this.groups();
    else if (tab === "events") this.eventList();
    else if (tab === "animals") {
      if (id === "new") this.animalForm();
      else if (id === "batch") this.moveForm();
      else if (id === "due") this.dueList();
      else if (id === "chute") this.chuteScreen();
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
      form.dataset.guideAction = action;
      const last = events(this.s,{type:"memberships",limit:1})[0]?.record;
      const group=form.elements.namedItem(action === "animal" ? "currentGroupId" : "groupId");
      if(group && last && [...group.options].some(o=>o.value===last.groupId))group.value=last.groupId;
      if(action === "breeding")form.elements.namedItem("serviceDate").value=this.today;
      if(action === "treatment" && !this.demoMode) treatmentTools(form, this.s.operation[0].id, safeDeviceStorage());
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
    const list = el("ul", undefined, "rows animal-list");
    const health = evaluateWithdrawal(this.s, { now: new Date().toISOString() });
    const healthById = new Map(health.animals.map((row) => [row.animal.id, row]));
    for (const a of result.rows) {
      const li = el("li", undefined, "list-row");
      const open = link("", `#animals/${a.id}`);
      open.className = "row-link";
      const text = el("span", undefined, "row-copy");
      text.append(
        el("strong", `${a.visualTag || "No visual tag"} · ${a.farmId}`),
        el("small", `${plainOption(a.sex)} · ${a.breed || "Unknown breed"} · ${plainOption(a.status)}`),
        el("small", `${this.s.groups.find((g) => g.id === a.currentGroupId)?.name || "No group"} · ${a.pasture || "No pasture"}`),
      );
      const badges = el("span", undefined, "row-badges");
      const row = healthById.get(a.id);
      if (row && (isHold(row.meat.status) || isHold(row.milk.status))) badges.append(el("span", "On a hold", "badge badge-hold"));
      if (row?.needsReview) badges.append(el("span", "Needs a check", "badge badge-check"));
      open.append(icon(a.sex === "female" ? "cow" : "calf"), text, badges);
      li.append(open);
      list.append(li);
    }
    if (!result.rows.length) {
      const li = el("li", undefined, "list-row empty-state");
      li.append(icon("animals"), el("p", "No animals match."));
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
  dueList() {
    this.title("Who is due");
    const rows = dueRows(this.s, this.today);
    const show = (title, list, empty) => {
      this.root.append(el("h2", title));
      const box = el("div", undefined, "due-list");
      if (!list.length) {
        const quiet = el("p", undefined, "empty-state");
        quiet.append(icon("calendar"), el("span", empty));
        box.append(quiet);
      }
      for (const row of list) {
        const line = el("article", undefined, "list-row");
        line.append(icon("calendar"), el("p", row.text), link("See this cow", row.href));
        box.append(line);
      }
      this.root.append(box);
    };
    show("Due this month", dueThisMonth(rows, this.today), "No calf is due this month.");
    show("All checks", rows, "No pregnancy check or breeding is saved.");
  }
  chuteScreen() {
    if (this.chute) return this.chuteRun();
    this.chutePick = this.chutePick || { ids: [] };
    this.title("Work a group");
    const picked = new Set(this.chutePick.ids);
    const search = el("form", undefined, "card");
    const query = field(search, "query", "Type a tag or scan", this.chutePick.query || "", { type: "search" });
    const jump = el("button", "Find");
    jump.type = "submit";
    search.append(jump);
    search.onsubmit = (e) => {
      e.preventDefault();
      const text = query.value.trim();
      this.chutePick.query = text;
      if (!text) return;
      const exact = this.s.animals.find((a) => a.visualTag === text || a.farmId === text);
      const hit = exact || searchAnimals(this.s, { query: text }).rows[0];
      if (!hit) {
        this.message("No animal matches that tag.", true);
        return;
      }
      if (!picked.has(hit.id)) this.chutePick.ids.push(hit.id);
      this.render(this.s, "animals/chute");
    };
    this.root.append(search);
    const groupForm = el("form", undefined, "card");
    const group = field(groupForm, "groupId", "Or pick a group", "", { options: this.groupOptions() });
    const useGroup = el("button", "Use this group");
    useGroup.type = "submit";
    groupForm.append(useGroup);
    groupForm.onsubmit = (e) => {
      e.preventDefault();
      if (!group.value) {
        this.message("Pick a group first.", true);
        return;
      }
      this.chutePick.ids = this.s.animals.filter((a) => a.status === "active" && a.currentGroupId === group.value).map((a) => a.id);
      this.render(this.s, "animals/chute");
    };
    this.root.append(groupForm);
    const list = el("div", undefined, "due-list");
    const chosen = this.s.animals.filter((a) => picked.has(a.id));
    if (!chosen.length) {
      const quiet = el("p", undefined, "empty-state");
      quiet.append(icon("animals"), el("span", "No animals picked yet."));
      list.append(quiet);
    }
    for (const animal of chosen) {
      const row = el("article", undefined, "list-row");
      row.append(icon("tag"), el("p", `${animal.visualTag || animal.farmId} · ${animal.farmId}`));
      row.append(button("Remove", () => {
        this.chutePick.ids = this.chutePick.ids.filter((id) => id !== animal.id);
        this.render(this.s, "animals/chute");
      }));
      list.append(row);
    }
    this.root.append(list, el("p", `${chosen.length} animals`, "chute-count"));
    const jobs = el("div", undefined, "actions");
    const start = (job, hash) => {
      if (!this.chutePick.ids.length) {
        this.message("Pick at least one animal.", true);
        return;
      }
      if (hash) {
        this.chuteIds = [...this.chutePick.ids];
        location.hash = hash;
        return;
      }
      this.chute = { ids: [...this.chutePick.ids], job, index: 0, shared: null, saved: 0 };
      this.render(this.s, "animals/chute");
    };
    const jobButton = (text, glyph, action) => {
      const control = button(text, action);
      control.prepend(icon(glyph));
      return control;
    };
    jobs.append(
      jobButton("Treat", "health", () => start("treat", "#health/batch")),
      jobButton("Move", "move", () => start("move", "#animals/batch")),
      jobButton("Weigh", "weight", () => start("weigh")),
      jobButton("Wean", "calf", () => start("wean")),
      jobButton("Sell", "sale", () => start("sell")),
    );
    this.root.append(jobs);
  }
  chuteRun() {
    const run = this.chute;
    const total = run.ids.length;
    const back = button("Back to the list", () => {
      if (this.saving) return;
      this.chute = null;
      this.render(this.s, "animals/chute");
    });
    if (run.index >= total) {
      this.title("Group work done");
      this.root.append(el("p", `Saved ${run.saved} of ${total}.`, "chute-count"), back);
      return;
    }
    const animal = this.s.animals.find((a) => a.id === run.ids[run.index]);
    const label = animal ? (animal.visualTag && animal.visualTag !== animal.farmId ? `${animal.farmId} ${animal.visualTag}` : animal.farmId) : "Animal";
    const titles = { sell: `Sell ${label}`, wean: `Wean ${label}`, weigh: `Weigh ${label}` };
    this.title(titles[run.job] || `Weigh ${label}`);
    this.root.append(el("p", `${run.index + 1} of ${total}`, "chute-count"));
    const jump = el("form", undefined, "card");
    const query = field(jump, "jump", "Type a tag or scan", "", { type: "search" });
    const go = el("button", "Find");
    go.type = "submit";
    jump.append(go);
    jump.onsubmit = (e) => {
      e.preventDefault();
      const text = query.value.trim();
      const hit = this.s.animals.find((a) => run.ids.includes(a.id) && (a.visualTag === text || a.farmId === text));
      if (!hit) {
        this.message("That animal is not in this group.", true);
        return;
      }
      run.index = run.ids.indexOf(hit.id);
      this.render(this.s, "animals/chute");
    };
    this.root.append(jump, back);
    if (!animal) {
      this.root.append(el("p", "That animal is not in the herd."), button("Next animal", () => {
        run.index += 1;
        this.render(this.s, "animals/chute");
      }));
      return;
    }
    if (!run.shared) return this.chuteShared(run);
    if (run.job === "sell") return this.chuteSell(run, animal, label);
    return this.chuteWeigh(run, animal, label);
  }
  chuteShared(run) {
    const form = el("form", undefined, "card");
    const date = field(form, "date", "What day is this?", this.today, { type: "date", required: true });
    let unit, destination, amount, currency;
    if (run.job === "sell") {
      destination = field(form, "destination", "Who is the buyer?", "");
      amount = field(form, "amount", "Sale amount", "", { inputMode: "decimal" });
      currency = field(form, "currency", "Currency", "");
    } else {
      unit = field(form, "unit", "Pounds or kilograms?", this.unit, { options: ["lb", "kg"] });
    }
    const start = el("button", "Start");
    start.type = "submit";
    form.append(start);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!date.value) {
        this.message("Pick the day.", true);
        return;
      }
      if (run.job === "sell" && !destination.value.trim()) {
        this.message("Type the buyer, or type Unknown.", true);
        return;
      }
      if (run.job === "sell" && amount.value.trim() && !/^[A-Za-z]{3}$/.test(currency.value.trim())) {
        this.message("Add the 3 letter currency.", true);
        return;
      }
      run.shared = {
        date: date.value,
        type: run.job === "wean" ? "weaning" : "other",
        unit: unit?.value || this.unit,
        destination: destination?.value.trim() || "",
        amount: amount?.value.trim() || null,
        currency: currency?.value.trim().toUpperCase() || null,
      };
      this.render(this.s, "animals/chute");
    };
    this.root.append(form);
  }
  async finishChuteStep(notice) {
    const run = this.chute;
    run.saved += 1;
    run.index += 1;
    this.message(notice);
    try {
      await this.refresh();
    } catch (error) {
      this.message(`Saved on this phone, but the view could not refresh: ${error.message}. Reload before entering it again.`, true);
    }
    const expected = run.index >= run.ids.length ? "Group work done" : `${run.index + 1} of ${run.ids.length}`;
    if (!this.root.textContent.includes(expected)) this.render(await this.repository().snapshot(), "animals/chute");
  }
  chuteWeigh(run, animal, label) {
    const form = el("form", undefined, "card");
    form.append(el("p", label));
    const value = field(form, "value", "Weight", "", { type: "number", min: "0.000001", step: "any", inputMode: "decimal" });
    const save = el("button", "Save weight");
    save.type = "submit";
    const next = button("Next animal", () => {
      if (this.saving) return;
      run.index += 1;
      this.render(this.s, "animals/chute");
    });
    const bar = el("div", undefined, "sticky");
    const actions = el("div", undefined, "actions");
    actions.append(save, next);
    bar.append(actions);
    form.append(bar);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (this.saving) return;
      if (!String(value.value).trim()) {
        this.message("Type a weight, or tap Next animal to skip.", true);
        return;
      }
      this.saving = true;
      try {
        await commitWorkflow(this.repository(), this.s, "weight", chuteWeightInput(animal.id, run.shared, value.value));
        await this.finishChuteStep(`Saved on this phone: weight ${value.value} ${run.shared.unit} for ${animal.visualTag || animal.farmId}.`);
      } catch (error) {
        this.message(`Not saved: ${error.message}`, true);
      } finally {
        this.saving = false;
      }
    };
    this.root.append(form);
  }
  chuteSell(run, animal) {
    const form = el("form", undefined, "card");
    const date = field(form, "date", "What day is this?", run.shared.date, { type: "date", required: true });
    this.health.departure(form, form, animal);
    field(
      form,
      "acknowledgeDeparture",
      "I reviewed this notice and original records. This acknowledgment does not authorize slaughter or milk sale. Required for departures.",
      false,
      { type: "checkbox" },
    );
    const save = el("button", "Save sale");
    save.type = "submit";
    const next = button("Next animal", () => {
      if (this.saving) return;
      run.index += 1;
      this.render(this.s, "animals/chute");
    });
    const bar = el("div", undefined, "sticky");
    const actions = el("div", undefined, "actions");
    actions.append(save, next);
    bar.append(actions);
    form.append(bar);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (this.saving) return;
      if (!form.elements.namedItem("acknowledgeDeparture").checked) {
        this.message("Check the notice for this animal before the sale is saved.", true);
        return;
      }
      this.saving = true;
      try {
        const shared = { ...run.shared, date: date.value };
        await commitWorkflow(this.repository(), this.s, "movement", chuteSaleInput(animal.id, shared, true));
        await this.finishChuteStep(`Saved on this phone: sale for ${animal.visualTag || animal.farmId}.`);
      } catch (error) {
        this.message(`Not saved: ${error.message}`, true);
      } finally {
        this.saving = false;
      }
    };
    this.root.append(form);
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
      ["DOB", `${a.birthDate || "Unknown"} · ${plainOption(a.birthDatePrecision)}`],
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
      
    ]) {
      dl.append(el("dt", label), el("dd", value || "Unknown"));
    }
    identity.append(dl);
    this.root.append(identity);
    const family = pedigreeView(this.s, a.id);
    if (family) {
      const box = el("section", undefined, "card pedigree");
      box.append(el("h2", "Family"));
      for (const row of family.rows) {
        const line = el("div", undefined, "pedigree-row");
        for (const cell of row) {
          const item = el("div");
          item.append(el("strong", cell.role), familyLink(cell));
          line.append(item);
        }
        box.append(line);
      }
      box.append(el("p", family.summary));
      if (!family.offspring.length) {
        const quiet = el("p", undefined, "empty-state");
        quiet.append(icon("calf"), el("span", "No calves saved yet."));
        box.append(quiet);
      }
      for (const calf of family.offspring) {
        const line = el("article", undefined, "list-row");
        line.append(icon("calf"), el("p", calf.text));
        if (calf.href) line.append(link("See this calf", calf.href));
        box.append(line);
      }
      this.root.append(box);
    }
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
    const chart = el("section", undefined, "card weight-chart");
    chart.append(el("h2", "Weight line"), drawWeightChart(document, weightPoints(weights, this.unit), this.unit));
    this.root.append(chart);
    this.root.append(el("h2", "Full dated history"));
    this.history(events(this.s, { animalId: a.id }));
  }
  history(rows) {
    const list = el("ul", undefined, "rows");
    for (const e of rows) {
      const r = e.record,
        li = el("li", undefined, "list-row event-row");
      const eventIcons = {weights:"weight",calvings:"calf",breedings:"breed",pregnancyChecks:"calendar",movements:"sale",treatments:"health",memberships:"move",animals:"cow",identifiers:"tag",groups:"group",revisions:"check",treatmentCourses:"health"};
      li.append(icon(eventIcons[e.store] || "tag"));
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
          "For helpers: full saved record",
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
        `${rows.length} events, newest first. Page ${page} of ${pages}. Old records and changes are kept.`,
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
    form.noValidate = true;
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
        status.textContent = entryError(e.target);
        let hint=e.target.parentNode.querySelector(".inline-error");if(!hint){hint=el("span",undefined,"inline-error");hint.setAttribute("role","alert");e.target.parentNode.append(hint);}hint.textContent=status.textContent;
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
      if (!form.checkValidity()) { status.focus(); return; }
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
        const result = await commitWorkflow(this.repository(), baseSnapshot, action, data);
        if(!this.demoMode && (action === "treatment" || action === "batch-treatment")) rememberTreatment(safeDeviceStorage(), baseSnapshot.operation[0].id, data);
        form.savedResult = result;
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
              " The saved answers are still on this phone. Reopening will show that they were saved.";
          }
        const animal = baseSnapshot.animals.find(a=>a.id === (data.animalId || resultAnimal(form.savedResult)));
        this.message(`Saved on this phone: ${action} ${data.value || ""} ${data.unit || ""} for ${animal?.visualTag || animal?.farmId || data.farmId || "your herd"}.${cleanup}`);
        const notice=document.getElementById("status");
        if(notice){ const change=link("Change it", action === "treatment" ? `#health/treatment/${form.savedResult?.id || form.savedResult?.[0]?.id}` : ["animal","group"].includes(action) && form.savedResult?.id ? `#${action === "animal" ? "animals" : "groups"}/${form.savedResult.id}/edit` : "#reports"); notice.append(change); }
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
      const members = this.s.animals.filter((a) => a.currentGroupId === g.id && a.status === "active");
      const gain = groupGain(this.s, members.map((a) => a.id), this.unit);
      card.append(
        el("h2", g.name),
        el(
          "p",
          `${g.type} · ${g.archivedAt ? "Archived" : "Active"} · ${members.length} active animals`,
        ),
        el("p", `Group gain: ${gain.text}.`),
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
          !!this.chuteIds?.includes(animal.id),
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
      if (this.chuteIds?.length) {
        this.chuteIds = null;
        selections.onchange();
      }
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
      {
        next: `#animals/${a.id}/${action}`,
        // A typed due date wins. Days until become a date only when she is pregnant.
        // Days already in calf are not a due date, and no gestation length is assumed.
        collect: action === "pregnancy" ? (data) => {
          if (data.result === "pregnant") {
            const nextDate = expectedFromDays(data.date, data.daysUntilCalving, data.expectedCalvingDate || null);
            if (nextDate) data.expectedCalvingDate = nextDate;
          }
          delete data.daysUntilCalving;
          return data;
        } : undefined,
      },
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
        "daysUntilCalving",
        "About how many days until she calves?",
        "",
        { type: "number", min: 0, inputMode: "numeric" },
      );
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
            "This phone cannot keep your answers. Allow browser storage before adding a calf.",
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
        "Your unsaved answers are back. Check and confirm the birth date before you save.";
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
    twin.className = "secondary";
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
          "Not saved yet. Your answers are kept on this phone until you tap Save.";
      } catch (e) {
        status.textContent = `Could not keep your answers: ${e.message}`;
      }
    };
    form.addEventListener("input", persist);
    form.addEventListener("change", persist);
    const discard = button("Discard draft and start again", () => {
        try {
          draft.clear();
          this.render(this.s, `animals/${dam.id}/calving`);
        } catch (e) {
          status.textContent = e.message;
        }
      });
    discard.className = "secondary danger";
    body.append(discard);
  }
}

function resultAnimal(result) { return result?.animalId || result?.[0]?.animalId; }
