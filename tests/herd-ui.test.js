// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { openRepository } from "../app/lib/database.js";
import { commitWorkflow, draftStore } from "../app/lib/workflows.js";
import { HerdUI } from "../app/lib/herd-ui.js";
async function setup() {
  const dom = new JSDOM('<main id="herd"></main>', {
    url: "https://herd.test/#animals/new",
  });
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.localStorage = dom.window.localStorage;
  const repo = await openRepository({ factory: new IDBFactory() });
  let notices = [],
    failRefresh = false;
  const root = document.getElementById("herd");
  const ui = new HerdUI(root, {
    repository: () => repo,
    message: (...m) => notices.push(m),
    refresh: async () => {
      if (failRefresh) throw new Error("View unavailable");
      ui.render(await repo.snapshot(), location.hash.slice(1));
    },
  });
  const render = async (route) => {
    location.hash = "#" + route;
    ui.render(await repo.snapshot(), route);
  };
  const field = (name, value) => {
    const e = root.querySelector(`[name="${name}"]`);
    assert.ok(e, `field ${name}`);
    if (value !== undefined) {
      if (e.type === "checkbox") e.checked = value;
      else e.value = value;
    }
    return e;
  };
  const submit = async (next = false) => {
    const form = root.querySelector("form");
    return form.onsubmit({
      preventDefault() {},
      submitter: form.querySelector(
        next ? 'button[value="next"]' : 'button[type="submit"]',
      ),
    });
  };
  const save = async (action, input) =>
    commitWorkflow(repo, await repo.snapshot(), action, input);
  const cleanup = () => {
    repo.close();
    dom.window.close();
  };
  return {
    dom,
    repo,
    ui,
    root,
    render,
    field,
    submit,
    save,
    notices,
    cleanup,
    failRefresh: () => {
      failRefresh = true;
    },
  };
}
test("animal form submits text identifiers, required fields, labels and numeric input modes", async () => {
  const h = await setup();
  await h.render("animals/new");
  assert.equal(h.root.querySelector("form").checkValidity(), false);
  h.field("farmId", "00001");
  h.field("visualTag", "000007");
  h.field("rfid", "000000000000000001");
  h.field("sex", "female");
  for (const input of h.root.querySelectorAll("input,select,textarea"))
    assert.ok(h.root.querySelector(`label[for="${input.id}"]`));
  await h.submit();
  const s = await h.repo.snapshot();
  assert.equal(s.animals[0].visualTag, "000007");
  assert.equal(s.animals[0].rfid, "000000000000000001");
  assert.match(h.notices.at(-1)[0], /Saved/);
  await h.render(`animals/${s.animals[0].id}/weight`);
  assert.equal(h.field("value").inputMode, "decimal");
  assert.ok(h.root.querySelector('.sticky button[value="next"]'));
  h.cleanup();
});
test("pedigree cycle from rendered animal form is rejected and error receives focus", async () => {
  const h = await setup(),
    dam = await h.save("animal", { farmId: "Dam", sex: "female" }),
    calf = await h.save("animal", {
      farmId: "Calf",
      sex: "female",
      damId: dam.id,
    });
  await h.render(`animals/${dam.id}/edit`);
  h.field("damId", calf.id);
  h.field("revisionReason", "Correct parent");
  await h.submit();
  assert.equal(
    (await h.repo.snapshot()).animals.find((a) => a.id === dam.id).damId,
    null,
  );
  assert.match(document.activeElement.textContent, /Not saved.*cycle/);
  assert.equal(h.field("farmId").disabled, false);
  h.cleanup();
});
test("calf UI recovers draft, adds twin and commits once after date confirmation", async () => {
  const h = await setup(),
    dam = await h.save("animal", { farmId: "Dam", sex: "female" });
  await h.render(`animals/${dam.id}/calving`);
  h.field("calf0:visualTag", "00002");
  h.field("calf0:sex", "female");
  h.field("calf0:weight", "80");
  h.field("calf0:visualTag").dispatchEvent(
    new h.dom.window.Event("input", { bubbles: true }),
  );
  assert.match(
    h.root.querySelector("[role=status]").textContent,
    /draft retained/,
  );
  await h.render(`animals/${dam.id}/calving`);
  assert.equal(h.field("calf0:visualTag").value, "00002");
  assert.equal(h.field("dateConfirmed").checked, false);
  [...h.root.querySelectorAll("button")]
    .find((b) => b.textContent === "Add twin to this delivery")
    .click();
  h.field("calf1:outcome", "stillborn");
  h.field("dateConfirmed", true);
  await h.submit();
  const s = await h.repo.snapshot();
  assert.equal(s.calvings.length, 1);
  assert.equal(s.calvings[0].calves.length, 2);
  assert.equal(s.weights.length, 1);
  assert.equal(s.animals.filter((a) => a.status === "dead").length, 1);
  assert.equal(
    draftStore(localStorage, s.metadata[0].datasetId).load(`calving:${dam.id}`),
    null,
  );
  h.cleanup();
});
test("rendered weight, breeding, pregnancy, group and movement forms commit correct fields", async () => {
  const h = await setup(),
    a = await h.save("animal", { farmId: "D", sex: "female" });
  await h.render(`animals/${a.id}/weight`);
  h.field("value", "400");
  h.field("type", "weaning");
  h.field("unit", "kg");
  await h.submit();
  await h.render(`animals/${a.id}/breeding`);
  h.field("serviceDate", "2026-10-01");
  h.field("sireReference", "SEED-0001");
  await h.submit();
  const breeding = (await h.repo.snapshot()).breedings[0];
  await h.render(`animals/${a.id}/pregnancy`);
  h.field("breedingId", breeding.id);
  h.field("result", "pregnant");
  h.field("estimatedGestationDays", "30");
  h.field("expectedCalvingDate", "2027-07-01");
  await h.submit();
  await h.render("groups/new");
  h.field("name", "North");
  await h.submit();
  const group = (await h.repo.snapshot()).groups[0];
  await h.render(`animals/${a.id}/move`);
  h.field("groupId", group.id);
  h.field("pasture", "Upper");
  h.field("revisionReason", "Seasonal move");
  await h.submit();
  await h.render(`animals/${a.id}/movement`);
  h.field("destination", "Buyer");
  h.field("acknowledgeDeparture", true);
  await h.submit();
  const s = await h.repo.snapshot();
  assert.equal(s.weights[0].value, 400);
  assert.equal(s.weights[0].unit, "kg");
  assert.equal(s.breedings[0].sireReference, "SEED-0001");
  assert.equal(s.pregnancyChecks[0].estimatedGestationDays, 30);
  assert.equal(s.animals[0].currentGroupId, group.id);
  assert.equal(s.animals[0].status, "sold");
  h.cleanup();
});
test("animal card and events render imported text safely and show all dated history", async () => {
  const h = await setup(),
    a = await h.save("animal", {
      farmId: "<img src=x onerror=alert(1)>",
      notes: "<script>alert(1)</script>",
      sex: "female",
    });
  await h.save("weight", {
    animalId: a.id,
    date: "2026-01-01",
    value: 400,
    unit: "lb",
    type: "other",
  });
  await h.save("weight", {
    animalId: a.id,
    date: "2026-01-31",
    value: 460,
    unit: "lb",
    type: "other",
  });
  await h.render(`animals/${a.id}`);
  assert.equal(h.root.querySelectorAll("script,img").length, 0);
  assert.match(h.root.textContent, /2.00 lb\/day/);
  assert.match(h.root.textContent, /30 calendar days/);
  assert.match(h.root.textContent, /<script>/);
  for (const label of ["Add calf", "Weight", "Breeding", "Move/Sale"])
    assert.ok(
      [...h.root.querySelectorAll("a")].some((a) => a.textContent === label),
    );
  await h.render("events");
  h.field("type", "weights");
  h.field("from", "2026-01-15");
  h.root.querySelector("form").onsubmit({ preventDefault() {} });
  assert.match(h.root.textContent, /1 events/);
  assert.match(h.root.textContent, /460 lb/);
  h.cleanup();
});
test("UI does not announce saved before mutation resolves and double submit is ignored", async () => {
  const h = await setup();
  await h.render("animals/new");
  h.field("farmId", "A");
  let finish,
    count = 0;
  const original = h.repo.mutate.bind(h.repo);
  h.repo.mutate = async (...args) => {
    count++;
    await new Promise((resolve) => {
      finish = resolve;
    });
    return original(...args);
  };
  const pending = h.submit();
  await Promise.resolve();
  assert.match(h.root.querySelector("[role=status]").textContent, /^Saving/);
  assert.ok(!h.notices.some((n) => /^Saved/.test(n[0])));
  await h.submit();
  assert.equal(count, 1);
  finish();
  await pending;
  assert.match(h.notices.at(-1)[0], /^Saved/);
  h.cleanup();
});
test("a post-commit refresh error reports committed records truthfully", async () => {
  const h = await setup();
  await h.render("animals/new");
  h.field("farmId", "A");
  h.failRefresh();
  await h.submit();
  assert.equal((await h.repo.snapshot()).animals.length, 1);
  assert.match(h.notices.at(-1)[0], /^Saved on this device, but/);
  h.cleanup();
});
test("interrupted committed draft is recognized, never silently submitted again", async () => {
  const h = await setup(),
    dam = await h.save("animal", { farmId: "Dam", sex: "female" });
  const data = {
    damId: dam.id,
    eventId: crypto.randomUUID(),
    birthDate: "2026-10-01",
    dateConfirmed: true,
    calves: [{ visualTag: "00" }],
  };
  const s = await h.repo.snapshot(),
    drafts = draftStore(localStorage, s.metadata[0].datasetId);
  drafts.save(`calving:${dam.id}`, data);
  await h.save("calving", data);
  await h.render(`animals/${dam.id}/calving`);
  assert.match(h.root.textContent, /Delivery already saved/);
  assert.equal(h.root.querySelector("form"), null);
  h.cleanup();
});
test("malformed calf draft offers explicit discard without overwriting it", async () => {
  const h = await setup(),
    dam = await h.save("animal", { farmId: "Dam", sex: "female" }),
    s = await h.repo.snapshot();
  const drafts = draftStore(localStorage, s.metadata[0].datasetId);
  drafts.save(`calving:${dam.id}`, { eventId: "bad" });
  await h.render(`animals/${dam.id}/calving`);
  assert.match(h.root.textContent, /draft needs attention/);
  assert.deepEqual(drafts.load(`calving:${dam.id}`), { eventId: "bad" });
  assert.equal(h.root.querySelector("form"), null);
  h.cleanup();
});

test("rendered batch selection previews names and commits one dated move for all selected animals", async () => {
  const h = await setup(),
    a = await h.save("animal", { farmId: "A" }),
    b = await h.save("animal", { farmId: "B" }),
    g = await h.save("group", { name: "North", type: "pasture" });
  await h.render("animals/batch");
  h.field(`animal:${a.id}`, true);
  h.field(`animal:${b.id}`, true);
  h.field(`animal:${b.id}`).dispatchEvent(
    new h.dom.window.Event("change", { bubbles: true }),
  );
  assert.match(h.root.textContent, /Selected: A, B/);
  h.field("groupId", g.id);
  h.field("revisionReason", "Move both");
  await h.submit();
  assert.equal((await h.repo.snapshot()).memberships.length, 2);
  h.cleanup();
});
test("calving transaction abort leaves draft and announces failure, never success", async () => {
  const h = await setup(),
    a = await h.save("animal", { farmId: "Dam", sex: "female" });
  await h.render(`animals/${a.id}/calving`);
  h.field("calf0:visualTag", "0003");
  h.field("dateConfirmed", true);
  h.repo.mutate = async () => {
    throw new DOMException("Device is full", "QuotaExceededError");
  };
  await h.submit();
  assert.match(document.activeElement.textContent, /Not saved.*Device is full/);
  assert.ok(!h.notices.some((n) => /^Saved/.test(n[0])));
  const s = await h.repo.snapshot();
  assert.equal(s.animals.length, 1);
  assert.equal(
    draftStore(localStorage, s.metadata[0].datasetId).load(`calving:${a.id}`)
      .calves[0].visualTag,
    "0003",
  );
  h.cleanup();
});
