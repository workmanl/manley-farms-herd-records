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
  dom.window.close();
});
