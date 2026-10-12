// SPDX-License-Identifier: AGPL-3.0-only
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
let repo,
  accepted = false,
  snapshot,
  operationRevision,
  plan,
  restoreInput,
  safetyBackup,
  decisions = {},
  busy = false;
const message = (text, error = false) => {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
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
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    message(e.message, true);
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
  snapshot = await repo.snapshot();
  accepted = await hasAccepted(snapshot);
  const op = snapshot.operation[0],
    meta = snapshot.metadata[0];
  operationRevision = op.revision;
  $("operation-name").value = op.name;
  $("time-zone").value = op.timeZone;
  $("weight-unit").value = op.weightUnit;
  $("theme").value = op.theme;
  $("reminder-days").value = op.backupReminderDays;
  theme(op.theme);
  $("last-export").textContent = meta.lastExportAttemptAt || "Never";
  $("last-confirmed").textContent = meta.lastUserConfirmedBackupAt || "Never";
  $("save-settings").disabled = !accepted || !!repo.recovery;
  route();
}
function route() {
  if (!repo) return;
  const tab = location.hash.slice(1) || "dashboard";
  const backup = tab === "backup";
  $("gate").hidden = accepted || backup || !!repo.recovery;
  $("backup").hidden = !backup || !!repo.recovery;
  $("placeholder").hidden =
    !accepted || backup || !!repo.recovery || tab === "terms";
  if (tab === "terms" && !repo.recovery) $("gate").hidden = false;
  $("gate-notice").hidden = accepted;
  for (const link of document.querySelectorAll("[data-tab]")) {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const titles = {
    dashboard: "Dashboard",
    animals: "Animals",
    events: "Events",
    reports: "Reports",
  };
  $("placeholder-title").textContent = titles[tab] || "Dashboard";
  $("placeholder-copy").textContent =
    {
      dashboard:
        "Herd summaries and withdrawal holds will arrive with the health workflows.",
      animals:
        "Animal records, parentage, groups and search are planned for Phase 3.",
      events:
        "Calving, weights, breeding and movements are planned for Phase 3.",
      reports:
        "Printable treatment logs, calving books and animal cards are planned for a later phase.",
    }[tab] || "Use Backup & Settings to manage your local records.";
}
async function bookkeeping(field) {
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
  await refresh();
}
async function showStorage() {
  const s = await storageStatus();
  const mb = (n) =>
    n === null ? "unavailable" : (n / 1048576).toFixed(2) + " MB";
  $("storage").textContent =
    `Persistent storage: ${s.persisted ? "granted" : s.supported ? "not granted" : "not supported"}. Usage: ${mb(s.usage)}. Estimated quota: ${mb(s.quota)}.`;
  $("persist").disabled = !s.supported;
}
function resetPlan() {
  plan = null;
  safetyBackup = null;
  $("preview-panel").hidden = true;
  $("commit").disabled = true;
  $("safety-file").value = "";
  $("warnings-check").checked = false;
  $("safety-result").textContent =
    "Current-records backup has not been verified.";
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
  );
  $("preview-panel").hidden = false;
  $("counts").replaceChildren();
  for (const [name, count] of Object.entries(plan.counts)) {
    const div = document.createElement("div"),
      strong = document.createElement("strong");
    strong.textContent = count;
    div.append(strong, document.createTextNode(name));
    $("counts").append(div);
  }
  $("preview-summary").textContent = plan.validationError
    ? `Cannot commit: ${plan.validationError}`
    : `${plan.conflicts.length} conflicting records. ${plan.skipped} identical records skipped. No live records have changed.`;
  $("conflicts").replaceChildren();
  for (const c of plan.conflicts) {
    const section = document.createElement("section");
    section.className = "conflict";
    const title = document.createElement("h3");
    title.textContent = `${c.store}: ${c.id}`;
    section.append(title);
    for (const [label, value] of [
      ["Current record", c.local],
      ["Incoming record", c.incoming],
    ]) {
      const details = document.createElement("details"),
        summary = document.createElement("summary"),
        pre = document.createElement("pre");
      summary.textContent = label;
      pre.textContent = JSON.stringify(value, null, 2);
      details.append(summary, pre);
      section.append(details);
    }
    const label = document.createElement("label");
    label.textContent = "Choose explicitly";
    const select = document.createElement("select");
    for (const [value, text] of [
      ["", "Unresolved"],
      ["local", "Keep current"],
      ...(c.store === "revisions"
        ? []
        : [["incoming", "Use incoming with correction history"]]),
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
    button.textContent = "Apply decisions and validate again";
    button.onclick = () => run(preview);
    $("conflicts").append(button);
  }
  $("warning-label").hidden = !plan.warnings.length;
  $("warnings-text").textContent =
    plan.warnings.join(" ") + " I reviewed these warnings.";
  $("replace-safety").hidden = plan.mode !== "replace";
  updateCommit();
}
for (const paragraph of INTRO.split("\n\n")) {
  const p = document.createElement("p");
  p.textContent = paragraph;
  $("intro").append(p);
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
  const b = await exportBackup(repo);
  download(b, filename());
  await bookkeeping("lastExportAttemptAt");
  message(
    "Export requested. Confirm only after you have saved the file outside this browser.",
  );
});
$("saved-check").onchange = () => {
  $("confirm-saved").disabled = !$("saved-check").checked;
};
on("confirm-saved", "click", async () => {
  if (!$("saved-check").checked) return;
  await bookkeeping("lastUserConfirmedBackupAt");
  $("saved-check").checked = false;
  $("confirm-saved").disabled = true;
  message("Your backup confirmation was saved.");
});
on("verify-file", "change", async () => {
  const file = $("verify-file").files[0];
  $("verify-result").textContent = "Not verified.";
  if (!file) return;
  const { backup, warnings } = await verifyBackup(await file.text());
  $("verify-result").textContent =
    `Verified: ${Object.values(backup.counts).reduce((a, b) => a + b, 0)} records across 14 stores. ${warnings.join(" ")}`;
  message("Backup verified. No live records changed.");
});
$("restore-file").onchange = () => {
  resetPlan();
  restoreInput = null;
  decisions = {};
  $("preview").disabled = !$("restore-file").files.length;
};
$("restore-mode").onchange = () => {
  decisions = {};
  resetPlan();
};
on("preview", "click", async () => {
  const file = $("restore-file").files[0];
  if (!file) return;
  restoreInput = await file.text();
  await preview();
});
on("cancel", "click", async () => {
  resetPlan();
  decisions = {};
  message("Restore preview canceled. No records changed.");
});
on("safety-download", "click", async () => {
  const b = await exportBackup(repo);
  download(b, filename("before-restore"));
  message(
    "Current-records backup download requested. Select the saved file below to verify it.",
  );
});
on("safety-file", "change", async () => {
  safetyBackup = null;
  $("safety-result").textContent =
    "Current-records backup has not been verified.";
  updateCommit();
  const file = $("safety-file").files[0];
  if (!file) return;
  const { backup } = await verifyBackup(await file.text());
  const current = await exportBackup(repo);
  if (!same(backup.stores, current.stores))
    throw new Error(
      "This backup does not match the current dataset. Download and select a new current-records backup.",
    );
  safetyBackup = backup;
  $("safety-result").textContent =
    "Saved current-records backup verified. Replacement can proceed after review.";
  updateCommit();
});
$("warnings-check").onchange = updateCommit;
on("commit", "click", async () => {
  await commitRestore(repo, plan, {
    safetyBackup,
    downloadConfirmed: !!safetyBackup,
    acknowledgeWarnings: $("warnings-check").checked,
  });
  resetPlan();
  await refresh();
  message(
    "Restore committed atomically. Review acknowledgment before ordinary use.",
  );
});
on("persist", "click", async () => {
  const granted = await navigator.storage.persist();
  await showStorage();
  message(
    granted
      ? "Persistent storage granted. Keep external backups."
      : "Persistent storage was not granted. Keep external backups.",
  );
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
window.addEventListener("hashchange", route);
await run(async () => {
  repo = await openRepository({
    onBlocked: message,
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
  if (repo.recovery) {
    $("recovery").hidden = false;
    $("recovery-message").textContent = repo.recovery;
    route();
    message("Recovery mode. Existing records have been retained.", true);
    return;
  }
  await refresh();
  await showStorage();
  message(
    "Local database ready. Changes are saved only after a transaction completes.",
  );
});
