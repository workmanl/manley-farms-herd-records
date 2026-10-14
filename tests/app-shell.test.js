// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
const until = async (fn) => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("App did not reach expected state");
};
test("real app shell gates workflows, routes nested forms, saves and applies sunlight theme app-wide", async () => {
  const dom = new JSDOM(
    fs.readFileSync(new URL("../app/index.html", import.meta.url), "utf8"),
    { url: "https://herd.test/#dashboard" },
  );
  let persistRequests = 0;
  Object.defineProperty(dom.window.navigator, 'storage', {value:{
    persisted:async()=>false, estimate:async()=>({}), persist:async()=>{persistRequests++;return false;}
  }});
  Object.defineProperty(globalThis, 'navigator', {value:dom.window.navigator,configurable:true});
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    localStorage: dom.window.localStorage,
    indexedDB: new IDBFactory(),
    matchMedia: () => ({ matches: false }),
  });
  await import("../app/app.js");
  const $ = (id) => document.getElementById(id);
  assert.equal(persistRequests,0);
  assert.equal($("public-intro").open, true);
  assert.equal($("herd").hidden, true);
  assert.equal($("gate").hidden, false);
  $("accept-check").checked = true;
  $("accept-check").dispatchEvent(new dom.window.Event("change"));
  $("accept").click();
  await until(
    () =>
      !$("herd").hidden && /Acknowledgment saved/.test($("status").textContent),
  );
  assert.match($("herd").textContent, /Your herd/);
  assert.match($("herd").textContent, /Meat hold/);
  location.hash = "#animals/new";
  await until(() => $("herd").querySelector("[name=farmId]"));
  assert.equal($("news-signup").hidden,true);
  assert.equal($("news-signup-link").hidden,true);
  $("herd").querySelector("[name=farmId]").value = "0001";
  $("herd")
    .querySelector("form")
    .dispatchEvent(
      new dom.window.Event("submit", { cancelable: true, bubbles: true }),
    );
  await until(
    () =>
      location.hash === "#animals" && /1 matching/.test($("herd").textContent),
  );
  assert.match($("status").textContent, /Saved/);
  await until(()=>persistRequests===1);
  assert.equal($("public-intro").open, false);
  assert.equal(document.querySelectorAll("#public-faq article").length, 8);
  location.hash = "#backup";
  await until(() => !$("backup").hidden);
  $("theme").value = "sunlight";
  $("settings").dispatchEvent(
    new dom.window.Event("submit", { cancelable: true, bubbles: true }),
  );
  await until(() => document.documentElement.dataset.theme === "sunlight");
  location.hash = "#animals";
  await until(() => !$("herd").hidden);
  assert.equal(document.documentElement.dataset.theme, "sunlight");
  assert.match($("herd").textContent, /0001/);
  assert.equal(
    document.querySelector("[data-tab=animals]").getAttribute("aria-current"),
    "page",
  );
  assert.equal($("backup-reminder").hidden, false);
  location.hash = "#reports";
  await until(
    () =>
      !$("ownership").hidden &&
      $("ownership").querySelector("#report-print-area table"),
  );
  assert.equal($("placeholder").hidden, true);
  assert.match($("ownership").textContent, /Switching away/);
  assert.match($("ownership").textContent, /CSV import/);
  location.hash = "#animals/new";
  await until(() => $("herd").querySelector("[name=farmId]"));
  $("herd").querySelector("[name=farmId]").value = "Unsaved draft";
  window.dispatchEvent(new dom.window.Event("pageshow"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal($("herd").querySelector("[name=farmId]").value, "Unsaved draft");
  $("backup-snooze").click();
  await until(() => $("backup-reminder").hidden);
  assert.equal($("herd").querySelector("[name=farmId]").value, "Unsaved draft");
  dom.window.close();
});

test("site landmarks remain separate from the five app tabs", () => {
  const document = new JSDOM(fs.readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')).window.document;
  assert.equal(document.querySelector('header.site-header nav').getAttribute('aria-label'), 'Primary');
  assert.equal(document.querySelector('.nav-links [aria-current="page"]').textContent, 'Tools');
  assert.equal(document.querySelectorAll('.app-tabs [data-tab]').length, 5);
  assert.equal(document.querySelector('.site-header').nextElementSibling.className, 'app-tabs print-hide');
  assert.equal(document.querySelector('.skip').getAttribute('href'), '#main');
  assert.ok(document.querySelector('footer.footer.print-hide .footer-contact'));
});
