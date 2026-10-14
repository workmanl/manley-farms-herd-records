import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { openRepository } from "../app/lib/database.js";
import { commitWorkflow, prepareWorkflow } from "../app/lib/workflows.js";
import {
  exportBackup,
  previewRestore,
  commitRestore,
} from "../app/lib/backup.js";
import { generateScale } from "../scripts/generate-scale.mjs";
const css = fs.readFileSync(
  new URL("../app/styles.css", import.meta.url),
  "utf8",
);
const tokens = (theme) => {
  const out = {};
  for (const [, selector, body] of css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      selector.trim() === ":root" ||
      (theme === "sunlight" &&
        selector.trim() === 'html[data-theme="sunlight"]')
    )
      for (const [, key, value] of body.matchAll(/--([\w-]+):\s*(#[\da-f]+)/g))
        out[key] = value;
  }
  return out;
};
const luminance = (hex) => {
  let s = hex.slice(1);
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  return s
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
};
const contrast = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
for (const theme of ["dark", "sunlight"])
  test(`${theme} CSS variables meet text and control contrast`, () => {
    const t = tokens(theme);
    for (const bg of ["bg", "card"])
      for (const fg of ["ink", "muted", "warn", "error", "link"])
        assert.ok(
          contrast(t[fg], t[bg]) >= 4.5,
          `${theme}: ${fg}/${bg} ${contrast(t[fg], t[bg])}`,
        );
    assert.ok(contrast(t["button-ink"], t.brand) >= 4.5);
    for (const bg of ["bg", "card"])
      for (const fg of ["line", "focus"])
        assert.ok(contrast(t[fg], t[bg]) >= 3, `${fg}/${bg}`);
  });
test("field CSS supports focus, reduced motion, 320px reflow and uncapped zoom", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 400px\)/);
  assert.match(css, /min-height: 48px/);
  const html = fs.readFileSync(
    new URL("../app/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(html, /maximum-scale|user-scalable/);
  assert.match(html, /initial-scale=1/);
});
test("static controls have accessible names and progress is labeled; live regions stay polite", () => {
  const dom = new JSDOM(
      fs.readFileSync(new URL("../app/index.html", import.meta.url), "utf8"),
    ),
    d = dom.window.document;
  for (const control of d.querySelectorAll(
    "button,input,select,textarea,progress,a",
  )) {
    const labels = control.labels
      ? [...control.labels].map((l) => l.textContent).join("")
      : "";
    // Terms checkbox is populated with the exact legal string during startup.
    if (control.id === "accept-check") continue;
    assert.ok(
      (
        control.getAttribute("aria-label") ||
        labels ||
        control.textContent
      ).trim(),
      control.outerHTML,
    );
  }
  assert.equal(d.querySelector('[aria-live="assertive"]'), null);
  assert.equal(
    d.querySelector("#transfer-progress").getAttribute("aria-live"),
    null,
  );
  dom.window.close();
});
test("deterministic scale generator retains exact event count, history and twenty-year dates", () => {
  const a = generateScale({ animals: 100, active: 5, events: 2500 }),
    b = generateScale({ animals: 100, active: 5, events: 2500 });
  assert.deepEqual(a, b);
  assert.equal(a.revisions.length, 250);
  assert.equal(a.weights[0].date, "2006-10-13");
  assert.equal(a.treatments.at(-1).administrationDate, "2026-10-12");
});
test("indexed ordinary weight save enforces foreign keys, shapes, duplicates, recovery and transaction completion", async () => {
  const repo = await openRepository({
    factory: new IDBFactory(),
    name: "field-weight",
  });
  await commitWorkflow(repo, await repo.snapshot(), "animal", {
    farmId: "001",
    sex: "female",
    status: "active",
  });
  const s = await repo.snapshot(),
    animalId = s.animals[0].id;
  const row = prepareWorkflow(s, "weight", {
    animalId,
    date: "2026-10-12",
    type: "other",
    value: "700",
    unit: "lb",
  }).result;
  await repo.appendWeight(row);
  assert.equal((await repo.snapshot()).weights.length, 1);
  await assert.rejects(repo.appendWeight(row));
  await assert.rejects(
    repo.appendWeight({
      ...row,
      id: crypto.randomUUID(),
      animalId: crypto.randomUUID(),
    }),
    /snapshot|reference/,
  );
  await assert.rejects(
    repo.appendWeight({
      ...row,
      id: crypto.randomUUID(),
      snapshots: [{ ...row.snapshots[0], groupId: crypto.randomUUID() }],
    }),
    /reference/,
  );
  await assert.rejects(
    repo.appendWeight({ ...row, id: crypto.randomUUID(), value: -1 }),
    /positive/,
  );
  repo.recovery = "Injected";
  await assert.rejects(
    repo.appendWeight({ ...row, id: crypto.randomUUID() }),
    /read-only/,
  );
  repo.close();
});
test("backup and restore progress completes only after successful committed transfer", async () => {
  const factory = new IDBFactory(),
    repo = await openRepository({ factory, name: "progress" }),
    target = await openRepository({ factory, name: "target" }),
    progress = [];
  const backup = await exportBackup(repo, undefined, (p) => progress.push(p));
  assert.equal(progress.at(-1).percent, 100);
  const safetyBackup = await exportBackup(target),
    plan = await previewRestore(
      target,
      backup,
      "replace",
      {},
      { onProgress: (p) => progress.push(p) },
    );
  await commitRestore(target, plan, {
    safetyBackup,
    downloadConfirmed: true,
    onProgress: (p) => progress.push(p),
  });
  assert.equal(progress.at(-1).phase, "Records restored");
  assert.ok(progress.length >= 7);
  repo.close();
  target.close();
});
test("bounded recent activity preserves full-history ordering", async () => {
  const { events } = await import("../app/lib/workflows.js");
  const s = generateScale({ animals: 100, active: 5, events: 2500 });
  for (const filters of [
    {},
    { type: "weights" },
    { animalId: s.animals[0].id },
    { from: "2010-01-01", to: "2020-12-31" },
  ])
    assert.deepEqual(
      events(s, { ...filters, limit: 5 }),
      events(s, filters).slice(0, 5),
    );
});
test("launch snapshot and clock are one validated transaction and consumed once", async () => {
  const { refreshHealth } = await import("../app/lib/health.js");
  const factory = new IDBFactory(),
    repo = await openRepository({
      factory,
      name: "launch",
      initialClock: "2026-10-12T12:00:00.000Z",
    });
  assert.ok(repo.openingSnapshot);
  const s = await refreshHealth(repo);
  assert.equal(s.metadata[0].lastObservedClockAt, "2026-10-12T12:00:00.000Z");
  assert.equal(repo.openingSnapshot, null);
  repo.close();
});
