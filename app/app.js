import {readDevice as readPreferences,writeDevice as writePreferences} from './lib/device-safety.js';
import {plainOption} from './lib/copy.js';
import {DEPLOY, NEW_ADDRESS} from './lib/deploy-config.js';
import {hasHerdRecords, shouldRedirect, verifyMoveCopy, removeMovedRecords} from './lib/origin-move.js';
import {hasDrafts} from './lib/pwa.js';
import {STORE_WORDS, recordLines} from './lib/backup-copy.js';
import {prepareCopy, saveCopy, checkCopy, practiceCopy, copySummary} from './lib/save-copy.js';
import {healthFromSnapshot} from './lib/backup-health.js';
import {keepRecords, safariTab, SAFARI_WARNING, SAFARI_STEPS, SAFARI_SEPARATE, readDevice, writeDevice} from './lib/device-safety.js';
import {readSafeFile, backupError} from './lib/file-safety.js';
const friendlyDate = value => value ? new Intl.DateTimeFormat("en-US", {dateStyle:"medium", timeStyle:"short"}).format(new Date(value)) : "Not yet";
let practiceRestore = false;
let readyCopy, pendingAnimalSave = false, phoneKeepsRecords = false;
import { openDemo, deleteDemo } from "./lib/demo.js";
// Mailing list signup stays on the main site.
import { updateIntroduction } from "./lib/landing.js";
import {
  startPWA,
  trackEdits,
  MIGRATION_RECEIPT,
  SCHEMA_VERSION,
} from "./lib/pwa.js";
import { sha256 } from "./lib/backup.js";
import { canonical } from "./lib/validation.js";
// SPDX-License-Identifier: AGPL-3.0-only
import { refreshHealth } from "./lib/health.js";
import { HerdUI } from "./lib/herd-ui.js";
import { openRepository, recoverySnapshot } from "./lib/database.js";
import {
  exportBackup,
  verifyBackup,
  previewRestore,
  commitRestore,
} from "./lib/backup.js";
import { same } from "./lib/validation.js";
import { hasAccepted, acknowledge, storageStatus } from "./lib/terms.js";
import {
  INTRO,
  CHECKBOX,
  FULL_TERMS,
  TERMS_VERSION,
} from "./lib/terms-copy.js";
const $ = (id) => document.getElementById(id);
const deviceStorage = (() => {try {return window.localStorage;} catch {return null;}})();
const migrationReceipt = () => {try {return deviceStorage?.getItem(MIGRATION_RECEIPT) || null;} catch {return null;}};
const edits = trackEdits(document);
import { OwnershipUI } from "./lib/ownership-ui.js";
import {
  backupReminder,
  snoozeBackup,
  backupContent,
  confirmRequestedBackup,
} from "./lib/reminders.js";
let herd, ownership, requestedBackup;
let repo,
  accepted = false,
  snapshot,
  operationRevision,
  plan,
  restoreInput,
  csvRestore = false,
  safetyBackup,
  decisions = {},
  busy = false;
let savedNoticeTimer;
const message = (text, error = false) => {
  $("status").hidden = !text;
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
  clearTimeout(savedNoticeTimer);
  $("status").dataset.saved=String(/^Saved on this phone/.test(text));
  if(/^Saved on this phone/.test(text))savedNoticeTimer=setTimeout(()=>{$("status").hidden=true;$("status").dataset.saved='false';},6000);
};
function download(value, name) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const filename = (prefix = "herd") =>
  `${prefix}-${(snapshot?.operation[0].name || "records").replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}-schema1.json`;
async function run(fn) {
  if (busy || document.body.inert) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    message(location.hash.startsWith("#backup") && /JSON|schema|dataset|checksum|restore preview|backup.*invalid/i.test(e.message) ? backupError(e) : e.message, true);
  } finally {
    busy = false;
  }
}
function on(id, event, fn) {
  $(id).addEventListener(event, (e) => {
    if (event === "submit") e.preventDefault();
    void run(() => fn(e));
  });
}
function theme(value) {
  document.documentElement.dataset.theme =
    value === "system"
      ? matchMedia("(prefers-color-scheme: light)").matches
        ? "sunlight"
        : "dark"
      : value;
}
async function refresh() {
  snapshot = await refreshHealth(repo);
  updateIntroduction($("public-intro"), snapshot);
  accepted = DEPLOY.moved || await hasAccepted(snapshot);
  updateMovePanel();
  const op = snapshot.operation[0],
    meta = snapshot.metadata[0];
  operationRevision = op.revision;
  $("operation-name").value = op.name;
  $("time-zone").value = op.timeZone;
  $("weight-unit").value = op.weightUnit;
  $("theme").value = op.theme;
  $("reminder-days").value = op.backupReminderDays;
  theme(op.theme);
  $("last-export").textContent = friendlyDate(meta.lastExportAttemptAt);
  $("last-confirmed").textContent = friendlyDate(meta.lastUserConfirmedBackupAt);
  $("save-settings").disabled = !accepted || !!repo.recovery;
  let demoBanner = $("demo-banner");
  if (!demoBanner) { demoBanner = document.createElement("aside"); demoBanner.id = "demo-banner"; $("main").prepend(demoBanner); }
  demoBanner.hidden = !herd?.demoMode;
  demoBanner.replaceChildren();
  const demoTitle = document.createElement("strong"); demoTitle.textContent = "DEMO HERD: practice cattle only";
  const demoCopy = document.createElement("p"); demoCopy.textContent = "Everything you save here stays separate from your real herd. Demo backups and exports are turned off.";
  demoBanner.append(demoTitle, demoCopy);
  if (herd?.demoMode) {
    const leave = document.createElement("button"); leave.type = "button"; leave.textContent = "Return to my real herd"; leave.onclick = () => herd.demo(false); const actions = document.createElement("div"); actions.className = "actions";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary danger"; remove.textContent = "Delete demo herd"; remove.onclick = () => herd.demo("delete");
    actions.append(leave, remove); demoBanner.append(actions);
  }
  readyCopy = null;
  if (!repo.recovery && !herd?.demoMode) readyCopy = await prepareCopy(repo);
  if (DEPLOY.moved) $("move-save").disabled = !readyCopy;
  try { phoneKeepsRecords = !!(await navigator.storage?.persisted?.()); } catch { phoneKeepsRecords = false; }
  if (pendingAnimalSave) {
    pendingAnimalSave = false;
    if (!herd?.demoMode && snapshot.animals.length === 1) {
      // The record is already committed. Storage failures cannot undo or block the save.
      void keepRecords(navigator.storage, deviceStorage).then(kept => {phoneKeepsRecords = kept;});
    }
  }
  route();
  showReminder();
}
function route() {
  if (!repo) return;
  let path = location.hash.slice(1) || "dashboard";
  if (DEPLOY.moved && (path.includes("/quick/") || /\/(new|add|edit|void|correct|batch|calving|weaning|pregnancy|sale|purchase)(\/|$)/.test(path))) {
    path = "dashboard"; message("This old address is read-only. Save a copy, then add new records at the new address.");
  }
  const tab = path.split("/")[0];
  document.body.dataset.work = String(accepted);
  let entering = path.includes('/quick/') || /\/(new|add|edit|void|correct|batch)(\/|$)/.test(path);
  document.body.dataset.recordEntry = String(entering);
  $('news-signup').hidden = DEPLOY.moved || entering;
  $('news-signup-link').hidden = DEPLOY.moved || entering;
  const herdTab = [
    "dashboard",
    "add",
    "animals",
    "groups",
    "events",
    "health",
  ].includes(tab);
  $("herd").hidden = !accepted || !herdTab || !!repo.recovery;
  if (!$("herd").hidden) herd.render(snapshot, path);
  entering = entering || (!$("herd").hidden && !!$("herd").querySelector('form .sticky'));
  document.body.dataset.recordEntry = String(entering);
  $('news-signup').hidden = DEPLOY.moved || entering;
  $('news-signup-link').hidden = DEPLOY.moved || entering;
  const backup = tab === "backup";
  $("ownership").hidden = tab !== "reports" || !accepted || !!repo.recovery || !!herd?.demoMode;
  if (!$("ownership").hidden) ownership.render(snapshot);
  if (DEPLOY.moved) enforceMovedView();
  $("gate").hidden = accepted || backup || !!repo.recovery;
  $("backup").hidden = !backup || !!repo.recovery || !!herd?.demoMode;
  $("placeholder").hidden =
    !accepted ||
    backup ||
    herdTab ||
    !!repo.recovery ||
    tab === "terms" ||
    tab === "reports";
  if (tab === "terms" && !repo.recovery) $("gate").hidden = false;
  $("gate-notice").hidden = accepted;
  for (const link of document.querySelectorAll("[data-tab]")) {
    if (link.dataset.tab === (path.includes("/quick/") ? "add" : tab === "groups" ? "animals" : tab))
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (herd?.demoMode && ["backup", "reports"].includes(tab)) {
    $("placeholder").hidden = false;
    $("placeholder-title").textContent = "Practice records stay here";
    $("placeholder-copy").textContent = "Demo backups, imports and exports are turned off so practice cattle cannot mix with your real herd. Return to Your herd to leave the demo, then use your real backup tools.";
    return;
  }
  $("placeholder-title").textContent = "Page not found";
  $("placeholder-copy").textContent =
    "Choose a tab above to return to your records.";
}
async function bookkeeping(field, { preserveView = false } = {}) {
  if (DEPLOY.moved) return;
  const s = await repo.snapshot();
  const m = s.metadata[0],
    now = new Date().toISOString();
  await repo.mutate(
    [
      {
        store: "metadata",
        record: {
          ...m,
          [field]: now,
          updatedAt: now,
          revision: m.revision + 1,
        },
        expectedRevision: m.revision,
      },
    ],
    { bookkeeping: true },
  );
  if (preserveView) await refreshReminder();
  else await refresh();
}
async function showStorage() {
  const s = await storageStatus();
  const mb = (n) =>
    n === null ? "unavailable" : (n / 1048576).toFixed(2) + " MB";
  $("storage").textContent =
    `${s.persisted ? "This phone was asked to keep records." : "This phone may clear records."} You use ${mb(s.usage)}. Keep a saved copy.`;
  $("persist").disabled = !readyCopy || !!herd?.demoMode;
}
function resetPlan() {
  plan = null;
  safetyBackup = null;
  $("preview-panel").hidden = true;
  $("commit").disabled = true;
  $("safety-file").value = "";
  $("warnings-check").checked = false;
  $("safety-result").textContent =
    "Current copy not checked yet.";
}
function updateCommit() {
  $("commit").disabled =
    !plan?.ready ||
    (plan.mode === "replace" && !safetyBackup) ||
    (plan.warnings.length > 0 && !$("warnings-check").checked);
}
async function preview() {
  resetPlan();
  plan = await previewRestore(
    repo,
    restoreInput,
    $("restore-mode").value,
    decisions,
    { onProgress: showProgress },
  );
  $("preview-panel").hidden = false;
  $("counts").replaceChildren();
  for (const [name, count] of Object.entries(plan.counts)) {
    const div = document.createElement("div"),
      strong = document.createElement("strong");
    strong.textContent = count;
    div.append(strong, document.createTextNode(STORE_WORDS[name] || name));
    $("counts").append(div);
  }
  $("preview-summary").textContent = plan.validationError
    ? "This copy has records that need a check. Nothing was changed here."
    : `${plan.conflicts.length} records need a choice. ${plan.skipped} records already match. No herd records changed.`;
  $("conflicts").replaceChildren();
  for (const c of plan.conflicts) {
    const section = document.createElement("section");
    section.className = "conflict";
    const title = document.createElement("h3");
    title.textContent = `${STORE_WORDS[c.store]}: ${c.local?.visualTag || c.local?.farmId || c.local?.name || "Choose which record to keep"}`;
    section.append(title);
    for (const [label, value] of [
      ["Current record", c.local],
      ["Record from the copy", c.incoming],
    ]) {
      const details = document.createElement("details"),
        summary = document.createElement("summary"),
        pre = document.createElement("pre");
      summary.textContent = label;
      pre.textContent = recordLines(value, [snapshot]);
      details.append(summary, pre);
      section.append(details);
    }
    const label = document.createElement("label");
    label.textContent = "Which record should we keep?";
    const select = document.createElement("select");
    for (const [value, text] of [
      ["", "Pick one"],
      ["local", "Keep this phone’s record"],
      ...(c.store === "revisions"
        ? []
        : [["incoming", "Use the copy and keep the history"]]),
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = decisions[c.key]?.choice || "";
    label.append(select);
    const reasonLabel = document.createElement("label");
    reasonLabel.textContent = "Correction reason (required for incoming)";
    const reason = document.createElement("input");
    reason.value = decisions[c.key]?.reason || "";
    reasonLabel.append(reason);
    section.append(label, reasonLabel);
    let review, reference;
    if (["treatments", "treatmentCourses"].includes(c.store)) {
      const reviewLabel = document.createElement("label");
      review = document.createElement("input");
      review.type = "checkbox";
      review.checked = !!decisions[c.key]?.holdReview;
      reviewLabel.className = "check";
      reviewLabel.append(
        review,
        document.createTextNode(
          "I explicitly reviewed the hold impact of this correction.",
        ),
      );
      const refLabel = document.createElement("label");
      refLabel.textContent = "Instruction evidence reference";
      reference = document.createElement("input");
      reference.value =
        decisions[c.key]?.holdReview?.instructionReference || "";
      refLabel.append(reference);
      section.append(reviewLabel, refLabel);
    }
    const save = () => {
      decisions[c.key] = {
        choice: select.value,
        reason: reason.value,
        holdReview: review?.checked
          ? {
              reviewedAt: new Date().toISOString(),
              reviewedBy: "Local operator",
              reason: reason.value,
              instructionReference: reference.value,
            }
          : null,
      };
      $("commit").disabled = true;
    };
    select.onchange = save;
    reason.oninput = save;
    if (review) {
      review.onchange = save;
      reference.oninput = save;
    }
    $("conflicts").append(section);
  }
  if (plan.conflicts.length) {
    const button = document.createElement("button");
    button.textContent = "Check these choices";
    button.onclick = () => run(preview);
    $("conflicts").append(button);
  }
  $("warning-label").hidden = !plan.warnings.length;
  $("warnings-text").textContent =
    plan.warnings.join(" ") + " I reviewed these warnings.";
  $("replace-safety").hidden = plan.mode !== "replace";
  updateCommit();
}
for(const text of ['Your records stay on this phone. Save copies.','This app does not tell you when meat or milk is safe. Follow the label and your vet.','Free. No account.']){const p=document.createElement('p');p.textContent=text;$('intro').append(p);}
const termsIntro=document.createElement('details');const termsSummary=document.createElement('summary');termsSummary.textContent='Read the full start notes';termsIntro.append(termsSummary);$('intro').append(termsIntro);
for (const paragraph of INTRO.split("\n\n")) {
  const p = document.createElement("p");
  p.textContent = paragraph;
  termsIntro.append(p);
}
$("accept-label").textContent = CHECKBOX;
$("full-terms").textContent =
  "Manley Farms Herd Records: Terms of Use and Disclaimer\n\n" + FULL_TERMS;
$("terms-version").textContent =
  `Terms version ${TERMS_VERSION}. Acceptance is stored only on this device.`;
$("accept-check").onchange = () => {
  $("accept").disabled = !$("accept-check").checked;
};
on("accept", "click", async () => {
  await acknowledge(repo, $("accept-check").checked);
  $("accept-check").checked = false;
  $("accept").disabled = true;
  await refresh();
  message("Acknowledgment saved on this device.");
});
on("download", "click", async () => {
  const b = await exportBackup(repo, undefined, showProgress);
  await verifyBackup(b);
  requestedBackup = backupContent(b.stores);
  download(b, filename());
  await bookkeeping("lastExportAttemptAt");
  message(
    "Download started. Save the file in Files. Then check your copy.",
  );
});
$("saved-check").onchange = () => {
  $("confirm-saved").disabled = !$("saved-check").checked;
};
on("confirm-saved", "click", async () => {
  if (!$("saved-check").checked) return;
  if (!DEPLOY.moved) await confirmRequestedBackup(repo, requestedBackup);
  await refresh();
  requestedBackup = null;
  $("saved-check").checked = false;
  $("confirm-saved").disabled = true;
  message("You marked the copy saved. Pick Check my copy to check it.");
});
on("verify-file", "change", async () => {
  const file = $("verify-file").files[0];
  $("verify-result").textContent = "Copy not checked.";
  if (!file) return;
  try {
    const bytes = await readSafeFile(file);
    const counts = await (practiceRestore ? practiceCopy(repo, bytes) : checkCopy(repo, bytes));
    if (practiceRestore) writeDevice(deviceStorage, {lastPracticeAt:Date.now()});
    $('verify-result').textContent = 'Copy checked. ' + copySummary(counts);
    phoneKeepsRecords = await keepRecords(navigator.storage, deviceStorage);
    await refresh();
    message('Copy checked. ' + copySummary(counts) + (practiceRestore ? ' Practice done. No herd records changed.' : ''));
    practiceRestore = false;
  } catch (e) {
    $('verify-result').textContent = /older than/.test(e.message) ? e.message : backupError(e);
    message($('verify-result').textContent, true);
  }
});
$("restore-file").onchange = () => {
  resetPlan();
  restoreInput = null;
  csvRestore = false;
  decisions = {};
  $("preview").disabled = !$("restore-file").files.length;
};
$("restore-mode").onchange = () => {
  decisions = {};
  resetPlan();
};
on("preview", "click", async () => {
  if (!csvRestore) {
    const file = $("restore-file").files[0];
    if (!file) return;
    restoreInput = await readSafeFile(file);
  }
  await preview();
});
on("cancel", "click", async () => {
  resetPlan();
  decisions = {};
  message("Restore preview canceled. No records changed.");
});
on("safety-download", "click", async () => {
  const b = await exportBackup(repo, undefined, showProgress);
  await verifyBackup(b);
  download(b, filename("before-restore"));
  message(
    "Download started. Pick the saved copy below to check it.",
  );
});
on("safety-file", "change", async () => {
  safetyBackup = null;
  $("safety-result").textContent =
    "Current copy not checked yet.";
  updateCommit();
  const file = $("safety-file").files[0];
  if (!file) return;
  const { backup } = await verifyBackup(await readSafeFile(file));
  const current = await exportBackup(repo);
  if (!same(backup.stores, current.stores))
    throw new Error(
      "This copy does not match your records. Save a new copy and pick it here.",
    );
  safetyBackup = backup;
  $("safety-result").textContent =
    "Current copy checked. Review the other copy, then use those records.";
  updateCommit();
});
$("warnings-check").onchange = updateCommit;
on("commit", "click", async () => {
  await commitRestore(repo, plan, {
    safetyBackup,
    onProgress: showProgress,
    downloadConfirmed: !!safetyBackup,
    acknowledgeWarnings: $("warnings-check").checked,
  });
  resetPlan();
  writeDevice(deviceStorage, {sharedAt:null, lastCopy:null});
  await refresh();
  message(
    "Records restored. Read and accept the terms to use them.",
  );
});
on("persist", "click", doSaveCopy);
on('practice-restore', 'click', () => {
  practiceRestore = true;
  $('verify-file').value = '';
  $('verify-file').click();
});
on("settings", "submit", async () => {
  if (!accepted) throw new Error("Acknowledge terms first.");
  const prior = snapshot.operation[0];
  const next = {
    ...prior,
    name: $("operation-name").value.trim(),
    timeZone: $("time-zone").value.trim(),
    weightUnit: $("weight-unit").value,
    theme: $("theme").value,
    backupReminderDays: Number($("reminder-days").value),
    revision: operationRevision + 1,
    updatedAt: new Date().toISOString(),
  };
  await repo.mutate(
    [{ store: "operation", record: next, expectedRevision: operationRevision }],
    { reason: "Update operation settings" },
  );
  await refresh();
  document.dispatchEvent(
    new window.CustomEvent("herd-saved", { detail: { form: $("settings") } }),
  );
  message("Settings saved with correction history.");
});
on("raw-export", "click", async () => {
  download(
    {
      format: "manley-herd-recovery",
      databaseVersion: repo.db.version,
      stores: await repo.snapshot(),
    },
    filename("recovery"),
  );
  message(
    "Raw recovery records downloaded. Keep this file for compatible-version recovery.",
  );
});
on("migration-export", "click", async () => {
  const saved = await recoverySnapshot();
  if (!saved)
    throw new Error("No pre-migration snapshot is stored in this browser.");
  download(saved, filename("pre-migration"));
  message("Pre-migration snapshot download requested.");
});
async function refreshReminder() {
  snapshot = await repo.snapshot();
  herd.s = snapshot;
  readyCopy = !repo.recovery && !herd?.demoMode ? await prepareCopy(repo) : null;
  showReminder();
}
function showReminder() {
  if (snapshot && !repo?.recovery && !herd?.demoMode) mountBackupPanel($("backup-light"));
  for (const root of document.querySelectorAll('#herd .backup-light')) mountBackupPanel(root);
}
async function snoozeCopyReminder() {
  await snoozeBackup(repo);
  await refreshReminder();
  message("We will remind you tomorrow. No copy was saved.");
}
ownership = new OwnershipUI($("ownership"), {
  repository: () => repo,
  refresh,
  message,
  advancedRestore: async (backup) => {
    resetPlan();
    restoreInput = backup;
    csvRestore = true;
    decisions = {};
    $("preview").disabled = false;
    location.hash = "#backup";
    message(
      "Files checked. Choose how to use the copy, then check the records.",
    );
  },
});
$("open-herd-records").addEventListener("click", () => {
  $("public-intro").open = false;
  $("main").focus();
});
let realRepo;
document.addEventListener('herd-saved', e => {
  if (snapshot?.animals.length === 0 && e.detail?.form?.querySelector('[name="farmId"]')) pendingAnimalSave = true;
});
herd = new HerdUI($("herd"), { repository: () => repo, refresh, message,
  backupPanel: mountBackupPanel,
  demo: (mode) => run(async () => {
    if (DEPLOY.moved) throw Error("Practice at the new address.");
    if (herd.saving || edits.dirty()) throw new Error("Finish or cancel your form before switching herds.");
    requestedBackup = null; resetPlan(); restoreInput = null;
    if (mode === true) {
      realRepo = repo;
      repo = await openDemo();
      herd.demoMode = true;
    } else {
      if (herd.demoMode) { repo.close(); repo = realRepo; }
      herd.demoMode = false;
      if (mode === "delete") await deleteDemo();
    }
    location.hash = "#dashboard";
    await refresh();
    message(herd.demoMode ? "Demo herd open. Real records are separate." : "Your real herd is open.");
  })
});
window.addEventListener("hashchange", () => {
  void run(refresh);
});
await run(async () => {
  repo = await openRepository({
    initialClock: new Date().toISOString(),
    onBlocked: message,
    targetVersion: SCHEMA_VERSION,
    downloadedBackup: !!migrationReceipt(),
    onBeforeUpgrade: async ({ snapshot: before, toVersion }) => {
      const receipt = JSON.parse(
        migrationReceipt() || "null",
      );
      if (
        !receipt ||
        receipt.schema !== toVersion ||
        receipt.hash !== (await snapshotHash(before))
      )
        return false;
      return true;
    },
    onVersionChange: () => {
      message(
        "Another tab changed the database version. Reload this tab before continuing.",
        true,
      );
      $("main")
        .querySelectorAll("button,input,select")
        .forEach((el) => (el.disabled = true));
    },
  });
  if (DEPLOY.moved && !repo.recovery && shouldRedirect(await repo.snapshot(), {moved:true, drafts:hasDrafts(deviceStorage)})) {
    document.body.dataset.emptyMove = "true";
    $("move-panel").hidden = false; $("move-title").textContent = "Herd Records moved";
    $("move-copy").textContent = "No herd records are saved here. Opening the new address.";
    $("move-save").hidden = true; $("move-check-label").hidden = true;
    location.replace(NEW_ADDRESS); return;
  }
  if (repo.recovery) {
    $("recovery").hidden = false;
    $("recovery-message").textContent = repo.recovery;
    route();
    message("Your records could not open. They are still on this phone. Use the recovery tools below.", true);
    return;
  }
  await refresh();
  await showStorage();
  message("");
});

// Update only derived panels during ticks/resume, retaining unsaved forms and focus.
async function refreshVisibleHealth() {
  if (
    !repo ||
    repo.recovery ||
    document.hidden ||
    document.body.inert ||
    busy ||
    herd.saving ||
    ownership.saving
  )
    return;
  await run(async () => {
    snapshot = await refreshHealth(repo);
    herd.s = snapshot;
    showReminder();
    if ((location.hash === "#dashboard" || !location.hash) && !$("herd").contains(document.activeElement)) herd.render(snapshot, "dashboard");
    if (DEPLOY.moved) enforceMovedView();
    for (const panel of document.querySelectorAll(".withdrawal-panel"))
      if (!panel.contains(document.activeElement)) herd.health.update(panel);
    for (const panel of document.querySelectorAll(".departure-preview"))
      panel.refreshPreview();
    // Source changes are also rejected against the opening snapshot at commit.
  });
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refreshVisibleHealth();
});
window.addEventListener("pageshow", () => {
  void refreshVisibleHealth();
});
const healthTimer = setInterval(() => {
  void refreshVisibleHealth();
}, 60000);
healthTimer.unref?.();

async function snapshotHash(s) {
  const ordered = Object.fromEntries(
    Object.entries(s).map(([k, rows]) => [
      k,
      [...rows].sort((a, b) => a.id.localeCompare(b.id)),
    ]),
  );
  return sha256(canonical(ordered));
}
void startPWA({
  edits,
  document,
  window,
  navigator,
  storage: deviceStorage,
  isBusy: () => busy || herd.saving || ownership.saving || !!plan,
  closeRepository: () => repo?.close(),
  verifyMigration: async (version, schema, file) => {
    const current = await repo.snapshot(),
      hash = await snapshotHash(current);
    if (file) {
      const { backup } = await verifyBackup(await readSafeFile(file));
      if ((await snapshotHash(backup.stores)) !== hash)
        throw Error(
          "Your records changed. Save and check a new copy first.",
        );
      if (!deviceStorage) throw Error("This phone cannot keep the update check. Use another browser.");
      deviceStorage.setItem(
        MIGRATION_RECEIPT,
        JSON.stringify({ version, schema, hash }),
      );
    }
    const receipt = JSON.parse(
      migrationReceipt() || "null",
    );
    if (
      receipt?.version !== version ||
      receipt?.schema !== schema ||
      receipt?.hash !== hash
    )
      throw Error("Save and check a current copy before this update.");
    return true;
  },
}).catch(() => {
  $("offline-status").textContent =
    "Cannot get ready offline. Connect and try again.";
});

function showProgress({ phase, percent }) {
  $("transfer-progress").hidden = false;
  $("transfer-progress-label").hidden = false;
  $("transfer-progress").value = percent;
  $("transfer-progress-label").textContent = `${phase}: ${percent}%`;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url; link.download = file.name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function doSaveCopy() {
  if (herd?.demoMode || repo.recovery) return;
  const now = new Date().toISOString();
  const result = await saveCopy(repo, readyCopy, {navigator, download:downloadFile, now});
  if (result.kind === 'cancelled') { message('Copy not saved. Try again when you are ready.'); return; }
  if (result.kind === 'shared') {
    writeDevice(deviceStorage, {sharedAt:now, lastCopy:result.counts});
    phoneKeepsRecords = await keepRecords(navigator.storage, deviceStorage);
    await bookkeeping('lastExportAttemptAt');
    message('Copy saved. ' + copySummary(result.counts));
  } else {
    requestedBackup = result.content;
    await bookkeeping('lastExportAttemptAt');
    message('Copy download started. Keep it in Files, then pick Check my copy.');
  }
}
function mountBackupPanel(root) {
  if (!root) return;
  const place = root.dataset.place;
  root.replaceChildren(); root.className = place === 'home' ? 'card backup-light home-backup' : 'card backup-light';
  if (place) root.dataset.place = place;
  if (herd?.demoMode) {root.hidden = true; return;}
  root.hidden = false;
  const device = readDevice(deviceStorage);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const safari = safariTab({agent:navigator.userAgent, standalone, touchPoints:navigator.maxTouchPoints});
  // A download marked saved by hand is not proof. Only a share or read-back check can turn green.
  const meta = {...snapshot.metadata[0]};
  if (meta.lastUserConfirmedBackupAt !== device.sharedAt) meta.lastUserConfirmedBackupAt = null;
  const state = healthFromSnapshot({...snapshot, metadata:[meta]}, {persisted:phoneKeepsRecords, safari});
  root.dataset.health = state.color;
  const add = (tag, text) => {const node=document.createElement(tag); node.textContent=text; root.append(node); return node;};
  add('h2', 'Your saved copy');
  add('p', `${state.checked ? '✓ ' : ''}${state.text}`).setAttribute('role', 'status');
  if (device.lastCopy) add('p', 'Last copy had ' + copySummary(device.lastCopy));
  const save=add('button','Save a copy'); save.type='button'; save.disabled=!readyCopy; save.onclick=()=>void run(doSaveCopy);
  const check=add('a','Check my copy'); check.href='#backup'; check.onclick=()=>setTimeout(()=>{ $('verify-file').scrollIntoView({block:'center'}); $('verify-file').focus(); },0);
  const why=add('details',''), summary=document.createElement('summary'); summary.textContent='Why?'; why.append(summary);
  for(const text of ['Your records stay on this phone.', 'A share or checked file is a saved copy.', state.storageNote]) {const p=document.createElement('p');p.textContent=text;why.append(p);}
  if(safari) {add('p',SAFARI_WARNING).className='safari-warning';add('p',SAFARI_SEPARATE);const list=add('ol','');for(const text of SAFARI_STEPS){const li=document.createElement('li');li.textContent=text;list.append(li);}}
  if (!device.lastPracticeAt || Date.now() - device.lastPracticeAt >= 30*86400000) add('p','Try a practice restore this month. Open Backup and pick your copy.');
  if (!DEPLOY.moved && accepted && backupReminder(snapshot)?.due) {
    const snooze=add('button','Remind me tomorrow');
    snooze.type='button'; snooze.className='secondary quiet-link';
    snooze.dataset.backupSnooze='true'; snooze.onclick=()=>void run(snoozeCopyReminder);
  }

}

function enforceMovedView() {
  // Keep view, print and export controls. Mutation paths are also blocked in storage.
  for (const root of [$('herd')]) {
    for (const link of root.querySelectorAll('a[href]')) {
      if (/\/(new|add|edit|void|correct|batch|quick|calving|weaning|pregnancy|sale|purchase|move|weight|breeding|movement|treatment|course|clock)(\/|$)/.test(link.getAttribute('href'))) {
        link.setAttribute('aria-disabled','true'); link.removeAttribute('href');
      }
    }
  }
  for (const id of ['save-settings','accept','commit','preview','restore-file','confirm-saved','practice-restore']) $(id).disabled = true;
}
function updateMovePanel() {
  $('restore-welcome').hidden = DEPLOY.moved || hasHerdRecords(snapshot);
  $('move-panel').hidden = !DEPLOY.moved;
  if (DEPLOY.moved) {
    document.body.dataset.moved = 'true';
    $('move-save').disabled = !readyCopy;
    $('move-open').href = NEW_ADDRESS;
  }
}
$('move-save').onclick = () => void run(doSaveCopy);
$('move-check').onchange = () => void run(async () => {
  const file = $('move-check').files[0]; if (!file) return;
  const counts = await verifyMoveCopy(repo, await readSafeFile(file));
  $('move-result').textContent = 'Copy checked. ' + copySummary(counts);
  $('move-remove').hidden = false;
});
$('move-remove').onclick = () => void run(async () => {
  if (!window.confirm('Have you restored and checked your herd at the new address? Remove the records from this old address? Your saved file will stay safe.')) return;
  await removeMovedRecords(repo, {confirmed:true, drafts:hasDrafts(deviceStorage)});
  repo.close(); location.replace(NEW_ADDRESS);
});

// Device preferences never change herd records or require a schema upgrade.
let preferenceStorage;try{preferenceStorage=localStorage;}catch{}
const applyText=size=>{document.documentElement.style.fontSize=([17,19,22].includes(Number(size))?size:17)+'px';};
applyText(readPreferences(preferenceStorage).textSize);
$('text-size').value=String(readPreferences(preferenceStorage).textSize || 17);
$('text-size').onchange=e=>{applyText(e.target.value);writePreferences(preferenceStorage,{textSize:Number(e.target.value)});void refresh();};
const zones=Intl.supportedValuesOf?.('timeZone') || [Intl.DateTimeFormat().resolvedOptions().timeZone];
for(const zone of new Set(['Etc/UTC',...zones])){const o=document.createElement('option');o.value=zone;o.textContent=zone==='Etc/UTC'?'World clock':zone.split('/').slice(1).join(', ').replaceAll('_',' ');$('time-zone').append(o);}
