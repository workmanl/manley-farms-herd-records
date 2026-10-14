import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";
import {
  readyOffline,
  updateAllowed,
  installGuidance,
  hasDrafts,
  trackEdits,
  workerStatus,
} from "../app/lib/pwa.js";
const root = new URL("../app/", import.meta.url),
  read = (p) => fs.readFileSync(new URL(p, root), "utf8");
function release() {
  const context = { self: {} };
  vm.runInNewContext(read("precache.js"), context);
  return JSON.parse(JSON.stringify(context.self.HERD_RELEASE));
}
function harness({ fail = false, clients = [] } = {}) {
  const handlers = {},
    cacheMap = new Map(),
    requests = [],
    messages = [];
  let skipped = false;
  const base = "https://farm.test/tools/herd-records/";
  const caches = {
    open: async (name) => {
      if (!cacheMap.has(name)) cacheMap.set(name, new Map());
      const m = cacheMap.get(name);
      return {
        match: async (key) => m.get(key)?.clone(),
        put: async (key, value) => m.set(key, value.clone()),
      };
    },
  };
  const self = {
    registration: { scope: base },
    clients: { matchAll: async () => clients },
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: async () => {
      skipped = true;
    },
  };
  const context = {
    self,
    caches,
    crypto: webcrypto,
    URL,
    Response,
    setTimeout: () => 0,
    importScripts: () => {
      self.HERD_RELEASE = release();
    },
    fetch: async (url) => {
      requests.push(url);
      if (fail && url.endsWith("help.html")) throw Error("Interrupted");
      return new Response(
        fs.readFileSync(new URL(url.slice(base.length), root)),
      );
    },
  };
  vm.runInNewContext(read("sw.js"), context);
  const dispatch = async (type, data = {}) => {
    let promise;
    handlers[type]({ ...data, waitUntil: (p) => (promise = p) });
    await promise;
  };
  const source = {
    id: "current",
    url: base,
    postMessage: (m) => messages.push(m),
  };
  return {
    base,
    handlers,
    caches,
    cacheMap,
    requests,
    messages,
    source,
    dispatch,
    get skipped() {
      return skipped;
    },
    status: async () => {
      let result;
      await dispatch("message", {
        source,
        data: { type: "HERD_STATUS" },
        ports: [{ postMessage: (m) => (result = m) }],
      });
      return result;
    },
  };
}
test("manifest stable identity, deploy scope, standalone and regular/maskable local icons", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.id, "/");
  assert.equal(m.scope, m.id);
  assert.equal(m.start_url, m.id);
  assert.equal(m.display, "standalone");
  assert.ok(m.name && m.short_name);
  assert.match(m.theme_color, /^#[\da-f]{6}$/);
  assert.match(m.background_color, /^#[\da-f]{6}$/);
  for (const purpose of ["any", "maskable"])
    assert.ok(m.icons.some((i) => i.purpose === purpose));
  for (const i of m.icons) {
    assert.ok(fs.existsSync(new URL(i.src, root)));
    if (i.type === "image/png") {
      const bytes = fs.readFileSync(new URL(i.src, root));
      const [w, h] = i.sizes.split("x").map(Number);
      assert.equal(bytes.readUInt32BE(16), w);
      assert.equal(bytes.readUInt32BE(20), h);
    }
  }
});
test("precache inventory exactly matches app files and current bytes including help and all imports", () => {
  const files = fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map(
      (e) =>
        (e.parentPath || e.path).slice(root.pathname.length) + "/" + e.name,
    )
    .map((p) => p.replace(/^\//, ""))
    .filter((p) => p !== "precache.js")
    .sort();
  assert.deepEqual(
    release().assets.map((a) => a.path),
    files,
  );
  for (const a of release().assets)
    assert.equal(
      a.sha256,
      createHash("sha256")
        .update(fs.readFileSync(new URL(a.path, root)))
        .digest("hex"),
      a.path,
    );
});
test("offline ready requires installed worker AND a complete verified shell", () => {
  for (const state of ["installing", "redundant"])
    assert.equal(readyOffline({ state }, { complete: true }), false);
  assert.equal(
    readyOffline({ state: "activated" }, { complete: false }),
    false,
  );
  assert.equal(readyOffline(null, { complete: true }), false);
  assert.equal(readyOffline({ state: "activated" }, { complete: true }), true);
});
test("worker precaches only local static bytes; readiness detects deletion and corruption", async () => {
  const h = harness();
  assert.equal((await h.status()).complete, false);
  await h.dispatch("install");
  assert.equal((await h.status()).complete, true);
  assert.ok(h.requests.every((u) => u.startsWith(h.base)));
  assert.equal(h.skipped, false);
  const cache = await h.caches.open([...h.cacheMap.keys()][0]);
  await cache.put(h.base + "help.html", new Response("corrupt"));
  assert.equal((await h.status()).complete, false);
});
test("worker scope isolation and cache-only navigation fallback leave sister app and requests alone", async () => {
  const h = harness();
  h.cacheMap.set("farm-records-v9", new Map([["x", new Response("keep")]]));
  await h.dispatch("install");
  await h.dispatch("activate");
  assert.ok(h.cacheMap.has("farm-records-v9"));
  for (const [url, method, mode] of [
    [h.base + "deep/route", "GET", "navigate"],
    [h.base, "GET", "navigate"],
  ]) {
    let response;
    h.handlers.fetch({
      request: { url, method, mode },
      respondWith: (p) => (response = p),
    });
    assert.match(await (await response).text(), /Herd Records/);
  }
  for (const url of [
    "https://farm.test/tools/farm-records/",
    "https://farm.test/tools/herd-records-other/",
    "https://elsewhere.test/tools/herd-records/",
    h.base + "private-records.json",
  ]) {
    let intercepted = false;
    h.handlers.fetch({
      request: { url, method: "GET", mode: "cors" },
      respondWith: () => (intercepted = true),
    });
    assert.equal(intercepted, false);
  }
  let intercepted = false;
  h.handlers.fetch({
    request: { url: h.base, method: "POST", mode: "navigate" },
    respondWith: () => (intercepted = true),
  });
  assert.equal(intercepted, false);
});
test("failed staged download does not activate or delete working caches", async () => {
  const h = harness({ fail: true });
  h.cacheMap.set("manley-herd-shell:old", new Map());
  await assert.rejects(h.dispatch("install"), /Interrupted/);
  assert.equal(h.skipped, false);
  assert.equal((await h.status()).complete, false);
  assert.ok(h.cacheMap.has("manley-herd-shell:old"));
});
test("dirty form, drafts, busy work and missing migration backup defer updates", () => {
  const clean = {
    dirty: false,
    drafts: false,
    busy: false,
    migration: false,
    backup: false,
  };
  assert.equal(updateAllowed(clean), true);
  for (const key of ["dirty", "drafts", "busy"])
    assert.equal(updateAllowed({ ...clean, [key]: true }), false);
  assert.equal(updateAllowed({ ...clean, migration: true }), false);
  assert.equal(
    updateAllowed({ ...clean, migration: true, backup: true }),
    true,
  );
});
test("every scoped tab must acknowledge preparation; dirty veto unlocks without activation", async () => {
  const messages = [],
    clients = ["one", "two"].map((id) => ({
      id,
      url: "https://farm.test/tools/herd-records/",
      postMessage: (m) => messages.push({ id, ...m }),
    }));
  const h = harness({ clients });
  await h.dispatch("install");
  const activation = h.dispatch("message", {
    source: clients[0],
    data: { type: "HERD_ACTIVATE" },
  });
  while (messages.length < 2) await new Promise((r) => setImmediate(r));
  const token = messages[0].token;
  await h.dispatch("message", {
    source: clients[0],
    data: { type: "HERD_ACK", token, ready: true },
  });
  assert.equal(h.skipped, false);
  await h.dispatch("message", {
    source: clients[1],
    data: { type: "HERD_ACK", token, ready: false },
  });
  await activation;
  assert.equal(h.skipped, false);
  assert.equal(messages.filter((m) => m.type === "HERD_UNLOCK").length, 2);
});
test("unanimous clean tabs activate only a complete staged release", async () => {
  const messages = [],
    clients = ["one", "two"].map((id) => ({
      id,
      url: "https://farm.test/tools/herd-records/",
      postMessage: (m) => messages.push(m),
    }));
  const h = harness({ clients });
  await h.dispatch("install");
  const activation = h.dispatch("message", {
    source: clients[0],
    data: { type: "HERD_ACTIVATE" },
  });
  while (messages.length < 2) await new Promise((r) => setImmediate(r));
  const token = messages[0].token;
  for (const source of clients)
    await h.dispatch("message", {
      source,
      data: { type: "HERD_ACK", token, ready: true },
    });
  await activation;
  assert.equal(h.skipped, true);
  assert.equal(messages.filter((m) => m.type === "HERD_RELOAD").length, 2);
});
test("form edits remain dirty after failed submit and clear only after saved signal; persisted drafts block", () => {
  const dom = new JSDOM("<form><label>Tag<input></label></form>", {
      url: "https://farm.test",
    }),
    d = dom.window.document,
    t = trackEdits(d),
    input = d.querySelector("input");
  assert.equal(t.dirty(), false);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(t.dirty(), true);
  d.dispatchEvent(
    new dom.window.CustomEvent("herd-saved", {
      detail: { form: d.querySelector("form") },
    }),
  );
  assert.equal(t.dirty(), false);
  dom.window.localStorage.setItem(
    "manley-herd-draft-v1:example:calving:dam",
    "bad",
  );
  assert.equal(hasDrafts(dom.window.localStorage), true);
  dom.window.close();
});
test("install instructions cover iOS, Android, Firefox, desktop Safari and installed mode", () => {
  assert.match(installGuidance("iPhone Safari"), /Share.*Add to Home Screen/);
  assert.match(installGuidance("Android Chrome"), /Install app/);
  assert.match(installGuidance("Firefox"), /browser tab/);
  assert.match(installGuidance("Safari"), /Add to Dock/);
  assert.match(installGuidance("Chrome", true), /Installed app/);
});
test("app has local resources, no remote imports or record-request sinks, and no outside connections", () => {
  // License/dictionary prose URLs and the SVG namespace are inert identifiers, not requests.
  for (const a of release().assets.filter((a) =>
    /\.(js|html|css|svg|webmanifest)$/.test(a.path),
  )) {
    let source = read(a.path).replaceAll("http://www.w3.org/2000/svg", "");
    if (a.path === "lib/csv-dictionary.js") continue;
    if (a.path === 'lib/deploy-config.js') source = source.replaceAll('https://herd.manleyfarms.com','');
    if (a.path.endsWith(".html")) {
      const document = new JSDOM(source).window.document;
      // Static metadata, JSON-LD and explicit navigation links are not resource loads.
      for (const node of document.querySelectorAll('script[src], img[src], iframe[src], link[rel="stylesheet"], link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="preload"], link[rel="preconnect"], link[rel="dns-prefetch"]')) {
        const path = node.getAttribute("src") || node.getAttribute("href");
        assert.doesNotMatch(path, /^(?:https?:)?\/\//i, a.path);
        assert.ok(!path.startsWith("../") && !path.startsWith("/"), path);
        assert.ok(fs.existsSync(new URL(path, root)), path);
      }
      for (const node of document.querySelectorAll('script[type="application/ld+json"], meta, a, link[rel="canonical"]')) node.remove();
      source = document.documentElement.outerHTML;
    }
    assert.doesNotMatch(
      source,
      /(?:https?:)?\/\/[^\s"'<>]+\.[a-z]{2,}/i,
      a.path,
    );
    assert.doesNotMatch(
      source,
      /XMLHttpRequest|WebSocket|sendBeacon|@import\s/i,
      a.path,
    );
  }
  assert.match(read("lib/pwa.js"), /if\s*\(!navigator.onLine\)\s*return/);
  assert.doesNotMatch(read("sw.js"), /caches\.delete|indexedDB|localStorage/);
});

test("PWA integration: offline startup uses cached status without fetching; dirty form never freezes or reloads", async () => {
  const { startPWA } = await import("../app/lib/pwa.js");
  const dom = new JSDOM(read("index.html"), {
    url: "https://farm.test/tools/herd-records/",
  });
  const document = dom.window.document,
    sent = [];
  let handler,
    network = 0,
    reloads = 0;
  const worker = {
    state: "activated",
    postMessage: (data, ports) =>
      ports?.[0].postMessage({ complete: true, schema: 1, version: "new" }),
  };
  const waiting = {
    ...worker,
    state: "installed",
    postMessage: (data, ports) =>
      ports ? worker.postMessage(data, ports) : sent.push(data),
  };
  const registration = {
    active: worker,
    waiting,
    update: async () => network++,
  };
  const navigator = {
    userAgent: "iPhone Safari",
    onLine: false,
    serviceWorker: {
      getRegistration: async () => registration,
      register: async () => {
        network++;
        return registration;
      },
      addEventListener: (_, fn) => (handler = fn),
    },
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    location: { reload: () => reloads++ },
  };
  await startPWA({
    document,
    window,
    navigator,
    storage: dom.window.localStorage,
    isBusy: () => false,
    verifyMigration: async () => true,
    closeRepository: () => {},
  });
  assert.equal(network, 0);
  assert.equal(
    document.getElementById("offline-status").textContent,
    "Ready offline",
  );
  const input = document.getElementById("operation-name");
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await document.getElementById("pwa-update").onclick();
  assert.equal(sent.length, 0);
  await handler({
    source: waiting,
    data: { type: "HERD_PREPARE", token: "dirty", schema: 1, version: "new" },
  });
  assert.equal(sent.at(-1).ready, false);
  assert.notEqual(document.body.inert, true);
  await handler({
    source: waiting,
    data: { type: "HERD_RELOAD", token: "dirty" },
  });
  assert.equal(reloads, 0);
  document.dispatchEvent(
    new dom.window.CustomEvent("herd-saved", {
      detail: { form: document.getElementById("settings") },
    }),
  );
  await handler({
    source: waiting,
    data: { type: "HERD_PREPARE", token: "clean", schema: 1, version: "new" },
  });
  assert.equal(sent.at(-1).ready, true);
  assert.equal(document.body.inert, true);
  await handler({
    source: waiting,
    data: { type: "HERD_UNLOCK", token: "clean" },
  });
  assert.equal(document.body.inert, false);
  assert.equal(reloads, 0);
  dom.window.close();
});
