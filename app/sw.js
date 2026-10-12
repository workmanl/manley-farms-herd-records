// SPDX-License-Identifier: AGPL-3.0-only
importScripts("./precache.js");
const release = self.HERD_RELEASE;
const base = self.registration.scope;
const cacheName = `manley-herd-shell:${encodeURIComponent(base)}:${release.version}`;
const assetURL = (path) => new URL(path, base).href;
const digest = async (response) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await response.arrayBuffer()),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
async function complete() {
  const cache = await caches.open(cacheName);
  for (const asset of release.assets) {
    const response = await cache.match(assetURL(asset.path));
    if (!response || (await digest(response)) !== asset.sha256) return false;
  }
  return true;
}
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      for (const asset of release.assets) {
        const response = await fetch(assetURL(asset.path), {
          cache: "reload",
          credentials: "same-origin",
          redirect: "error",
        });
        if (!response.ok || (await digest(response.clone())) !== asset.sha256)
          throw Error("Incomplete release download");
        await cache.put(assetURL(asset.path), response);
      }
      if (!(await complete())) throw Error("Incomplete app shell");
      // Never skip waiting on install. Existing clients retain their release.
    })(),
  ),
);
// Keep old releases: old open tabs and rollback must retain their own complete shell.
self.addEventListener("activate", (event) =>
  event.waitUntil(
    complete().then((ok) => {
      if (!ok) throw Error("Shell verification failed");
    }),
  ),
);
function scoped(url) {
  const u = new URL(url);
  return u.origin === new URL(base).origin && u.href.startsWith(base);
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !scoped(request.url)) return;
  const url = new URL(request.url);
  url.hash = "";
  url.search = "";
  const asset = release.assets.find((a) => assetURL(a.path) === url.href);
  if (request.mode !== "navigate" && !asset) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      // Only static, inventoried assets. Never cache requests, queries or record data.
      return (
        (await cache.match(
          asset ? assetURL(asset.path) : assetURL("index.html"),
        )) ||
        new Response(
          "Offline shell unavailable. Reconnect and reopen Herd Records.",
          { status: 503, headers: { "Content-Type": "text/plain" } },
        )
      );
    })(),
  );
});
let attempt;
let activationStarting = false;
async function clientsInScope() {
  return (
    await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  ).filter((c) => scoped(c.url));
}
function cancel() {
  if (!attempt) return;
  for (const c of attempt.clients)
    c.postMessage({ type: "HERD_UNLOCK", token: attempt.token });
  attempt.resolve();
  attempt = null;
}
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (!event.source || !scoped(event.source.url)) return;
  if (data.type === "HERD_STATUS")
    event.waitUntil(
      (async () =>
        event.ports[0]?.postMessage({
          complete: await complete(),
          version: release.version,
          schema: release.schema,
        }))(),
    );
  if (data.type === "HERD_ACTIVATE")
    event.waitUntil(
      (async () => {
        if (attempt || activationStarting) return;
        activationStarting = true;
        try {
          if (!(await complete())) return;
          const clients = await clientsInScope(),
            token = crypto.randomUUID();
          await new Promise((resolve) => {
            attempt = { clients, token, resolve, acks: new Set() };
            for (const client of clients)
              client.postMessage({
                type: "HERD_PREPARE",
                token,
                schema: release.schema,
                version: release.version,
              });
            setTimeout(() => {
              if (attempt?.token === token) cancel();
            }, 12000);
          });
        } finally {
          activationStarting = false;
        }
      })(),
    );
  if (data.type === "HERD_ACK")
    event.waitUntil(
      (async () => {
        const a = attempt;
        if (
          !a ||
          data.token !== a.token ||
          !a.clients.some((c) => c.id === event.source.id)
        )
          return;
        if (!data.ready) {
          cancel();
          return;
        }
        a.acks.add(event.source.id);
        if (a.acks.size !== a.clients.length) return;
        const current = await clientsInScope();
        if (attempt !== a) return;
        if (
          current.length !== a.clients.length ||
          current.some((c) => !a.acks.has(c.id))
        ) {
          cancel();
          return;
        }
        if (!(await complete())) {
          cancel();
          return;
        }
        const finalClients = await clientsInScope();
        if (
          finalClients.length !== current.length ||
          finalClients.some((c) => !a.acks.has(c.id))
        ) {
          cancel();
          return;
        }
        await self.skipWaiting();
        for (const c of current)
          c.postMessage({ type: "HERD_RELOAD", token: a.token });
        a.resolve();
        attempt = null;
      })(),
    );
});
