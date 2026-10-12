// SPDX-License-Identifier: AGPL-3.0-only
export const SCHEMA_VERSION = 1;
export const MIGRATION_RECEIPT = `manley-herd-migration-backup:${new URL("../", import.meta.url).pathname}`;
export function installGuidance(agent, standalone = false) {
  if (standalone)
    return "Installed app. Verify this context has your expected herd and keep external backups.";
  if (/iPhone|iPad|iPod/.test(agent))
    return "In Safari, open Share, then Add to Home Screen. Browser and installed records may be separate.";
  if (/Android/.test(agent))
    return "In Chrome, open the menu and choose Install app or Add to Home screen.";
  if (/Firefox/.test(agent))
    return "Use Herd Records in this browser tab. Installation support varies by browser and device.";
  if (/Safari/.test(agent) && !/Chrome|Edg/.test(agent))
    return "In Safari on Mac, use File > Add to Dock where available, or keep using this tab.";
  return "Use the install control in Chrome or Edge, or keep using this browser tab.";
}
export function hasDrafts(storage) {
  try {
    for (let i = 0; i < storage.length; i++)
      if (storage.key(i)?.startsWith("manley-herd-draft-v1:")) return true;
    return false;
  } catch {
    return true;
  }
}
export function workerStatus(worker, Channel = MessageChannel) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      resolve({ complete: false });
      return;
    }
    const channel = new Channel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(Error("Offline check timed out."));
    }, 8000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(e.data);
    };
    worker.postMessage({ type: "HERD_STATUS" }, [channel.port2]);
  });
}
export const readyOffline = (worker, status) =>
  ["installed", "activating", "activated"].includes(worker?.state) &&
  status?.complete === true;
export function updateAllowed({ dirty, drafts, busy, migration, backup }) {
  return !dirty && !drafts && !busy && (!migration || backup);
}
// Conservative tracking: failed submissions stay dirty. Successful commits explicitly clear.
export function trackEdits(document) {
  const dirty = new Set();
  const change = (e) => {
    if (
      e.target.matches?.("input,select,textarea") &&
      !e.target.closest("#pwa-panel")
    )
      (e.target.closest("form") || e.target.closest("#ownership")) &&
        dirty.add(e.target.closest("form") || e.target);
  };
  document.addEventListener("input", change);
  document.addEventListener("change", change);
  document.addEventListener("herd-saved", (e) => {
    if (e.detail?.form) dirty.delete(e.detail.form);
  });
  return {
    dirty: () => [...dirty].some((el) => el.isConnected),
    clear: () => dirty.clear(),
  };
}
export async function startPWA({
  document,
  window,
  navigator,
  storage,
  isBusy,
  verifyMigration,
  closeRepository,
  edits = trackEdits(document),
}) {
  const $ = (id) => document.getElementById(id);
  $("install-guidance").textContent = installGuidance(
    navigator.userAgent,
    window.matchMedia?.("(display-mode: standalone)").matches ||
      navigator.standalone,
  );
  if (!navigator.serviceWorker) {
    $("offline-status").textContent =
      "Offline preparation is unavailable in this browser context.";
    return;
  }
  let registration,
    locked = null,
    waitingStatus;
  const safe = () =>
    updateAllowed({
      dirty: edits.dirty(),
      drafts: hasDrafts(storage),
      busy: isBusy(),
      migration: false,
    });
  function unlock() {
    locked = null;
    document.body.inert = false;
    $("pwa-update").disabled = false;
  }
  navigator.serviceWorker.addEventListener("message", async (e) => {
    const d = e.data || {};
    if (d.type === "HERD_PREPARE") {
      const validSource = e.source === registration?.waiting;
      let ready = validSource && safe();
      if (ready) {
        locked = d.token;
        document.body.inert = true;
        $("pwa-update").disabled = true;
      }
      try {
        if (ready && d.schema !== SCHEMA_VERSION)
          ready = await verifyMigration(d.version, d.schema);
      } catch {
        ready = false;
      }
      if (!ready && locked === d.token) unlock();
      e.source.postMessage({ type: "HERD_ACK", token: d.token, ready });
      if (!ready)
        $("update-status").textContent =
          "Update deferred. Save forms and drafts in every tab, finish current work, and verify a backup if requested.";
    }
    if (d.type === "HERD_UNLOCK" && locked === d.token) {
      unlock();
      $("update-status").textContent =
        "Update deferred. Another tab is busy, has unsaved work, or did not respond. Save work or close that tab and retry.";
    }
    if (d.type === "HERD_RELOAD" && locked === d.token) {
      const worker = e.source;
      const reload = () => {
        if (worker.state === "activated") {
          closeRepository();
          window.location.reload();
        }
      };
      worker.addEventListener("statechange", reload);
      reload();
    }
  });
  async function inspect() {
    const active = registration.active;
    try {
      const status = await workerStatus(active);
      $("offline-status").textContent = readyOffline(active, status)
        ? "Ready offline"
        : "Offline preparation is not complete. Keep this page open while connected.";
      const waiting = registration.waiting;
      waitingStatus = waiting && (await workerStatus(waiting));
      $("pwa-update").hidden = !readyOffline(waiting, waitingStatus);
      if (!$("pwa-update").hidden)
        $("update-status").textContent =
          waitingStatus.schema !== SCHEMA_VERSION
            ? "Update staged. Download and verify a current backup before this schema migration."
            : "Update staged. Save your work in every Herd Records tab, then choose Update when ready.";
      $("update-backup").hidden =
        !waitingStatus || waitingStatus.schema === SCHEMA_VERSION;
    } catch {
      $("offline-status").textContent =
        "Offline cache check failed. Reconnect and try again.";
    }
  }
  $("pwa-update").onclick = async () => {
    if (!safe()) {
      $("update-status").textContent =
        "Update deferred. Save or discard unsaved forms and calf drafts first.";
      return;
    }
    if (!registration.waiting) return;
    registration.waiting.postMessage({ type: "HERD_ACTIVATE" });
  };
  $("update-backup-file").onchange = async () => {
    try {
      await verifyMigration(
        waitingStatus.version,
        waitingStatus.schema,
        $("update-backup-file").files[0],
      );
      $("update-status").textContent =
        "Saved backup verified. Choose Update when ready.";
    } catch (e) {
      $("update-status").textContent = e.message;
    }
  };
  async function connect() {
    if (!navigator.onLine) return;
    try {
      registration ||= await navigator.serviceWorker.register(
        new URL("../sw.js", import.meta.url),
        {
          scope: new URL("../", import.meta.url).pathname,
          updateViaCache: "none",
        },
      );
      const watch = () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (["installed", "activated", "redundant"].includes(worker.state))
            void inspect();
        });
      };
      registration.onupdatefound = watch;
      watch();
      await registration.update();
      await inspect();
    } catch {
      $("update-status").textContent =
        "Download did not finish. The previous installed version remains available. Retry when connected.";
    }
  }
  registration = await navigator.serviceWorker.getRegistration(
    new URL("../", import.meta.url),
  );
  if (registration) await inspect();
  window.addEventListener("online", () => void connect());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (navigator.onLine) void connect();
      else if (registration) void inspect();
    }
  });
  await connect();
}
