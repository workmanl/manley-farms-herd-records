// SPDX-License-Identifier: AGPL-3.0-only
// Pure derived results. Callers supply the device clock; no persistence or DOM.
export const DASHBOARD_NOTICE =
  "Calculated from your entries, not a drug database. Follow the applicable label and your veterinarian's instructions. Unknown timing, open courses and unresolved conditions require review. “Recorded interval elapsed” is not permission for slaughter or milk sale. Verify records, instructions and the device clock before acting.";
export const DEPARTURE_NOTICE =
  "Review the event-time and current meat and milk results and the contributing records. Recording this departure does not authorize slaughter or milk sale.";
export const LABELS = {
  held: "Hold",
  "needs-review": "Needs review",
  elapsed: "Recorded interval elapsed",
  "not-applicable": "Not applicable",
  "no-recorded-interval": "No recorded interval",
};
export const isHold = (status) => ["held", "needs-review"].includes(status);
const ms = (value) => (value ? Date.parse(value) : NaN);
const iso = (value) => new Date(value).toISOString();
export function remainingTime(value) {
  const minutes = Math.ceil(Math.max(0, value) / 60000);
  if (!minutes) return null;
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    rest = minutes % 60;
  return `${days ? `${days}d ` : ""}${days || hours ? `${hours}h ` : ""}${rest}m`;
}
function result(status, release = null, reasons = [], now) {
  return {
    status,
    label: LABELS[status],
    releaseAt: release === null ? null : iso(release),
    remaining: status === "held" ? remainingTime(release - now) : null,
    reasons,
  };
}
export function clockState(metadata, now) {
  const backward =
    Number.isFinite(ms(metadata?.lastObservedClockAt)) &&
    ms(now) < ms(metadata.lastObservedClockAt);
  return {
    reviewRequired: !!metadata?.clockReviewRequired || backward,
    lastObservedClockAt: backward ? metadata.lastObservedClockAt : now,
  };
}
function contribution(t, commodity, s, now, clockAlert, administrationClock) {
  const r = t[commodity];
  const reasons = [];
  const review = (reason) => {
    reasons.push(reason);
  };
  if (r?.state === "not-applicable")
    return { treatment: t, ...result("not-applicable", null, [], now) };
  const c = t.courseId && s.treatmentCourses.find((c) => c.id === t.courseId);
  const doses = c
    ? s.treatments.filter((d) => d.courseId === c.id && !d.voidedAt)
    : [t];
  const final = c ? doses.find((d) => d.id === c.finalAdministrationId) : t;
  const anchor = ms(final?.administrationAt);
  if (clockAlert) review("device clock moved backward");
  if (t.courseId && (!c || c.voidedAt || c.state !== "closed" || !final))
    review("course open or unresolved");
  if (
    doses.some(
      (d) =>
        ms(d.administrationAt) > administrationClock ||
        (!d.administrationAt &&
          d.administrationDate >
            localParts(
              iso(administrationClock),
              d.timeZone || s.operation?.[0]?.timeZone || "Etc/UTC",
            ).slice(0, 10)),
    )
  )
    review("future administration");
  if (c && doses.some((d) => ms(d.administrationAt) > anchor))
    review("course final dose is not latest");
  if (r?.state === "prohibited") review("prohibited use");
  let release = null;
  if (r?.directedReleaseAt) {
    if (
      !["unknown", "manual-review"].includes(r.state) ||
      r.source !== "vet" ||
      !r.instructionText ||
      !r.instructionReference ||
      !r.resolutionReason ||
      !r.resolvedBy ||
      !Number.isFinite(ms(r.resolvedAt)) ||
      !Number.isFinite(ms(r.directedReleaseAt))
    )
      review("directed release evidence incomplete");
    else {
      release = ms(r.directedReleaseAt);
      if (
        doses.some(
          (d) =>
            Number.isFinite(ms(d.administrationAt)) &&
            ms(d.administrationAt) > release,
        )
      )
        review("directed release precedes administration");
    }
  } else if (r?.state === "duration") {
    if (
      !Number.isFinite(r.value) ||
      r.value < 0 ||
      !["days", "hours"].includes(r.unit) ||
      !r.source ||
      !r.instructionReference ||
      (r.value === 0 && !r.zeroConfirmedAt)
    )
      review("duration or explicit zero confirmation missing");
    if (!Number.isFinite(anchor) || doses.some((d) => !d.administrationAt))
      review("administration time missing");
    if (!reasons.length) {
      release = anchor + r.value * (r.unit === "days" ? 24 : 1) * 3600000;
      if (
        !Number.isSafeInteger(release) ||
        Math.abs(release) > 8640000000000000
      ) {
        release = null;
        review("interval outside supported range");
      }
    }
  } else if (r?.state === "manual-review")
    review("non-time condition or unresolved instructions");
  else if (r?.state !== "prohibited") review("unknown duration");
  return {
    treatment: t,
    anchorAt: Number.isFinite(anchor) ? iso(anchor) : null,
    ...result(
      reasons.length
        ? "needs-review"
        : release === null
          ? "needs-review"
          : now < release
            ? "held"
            : "elapsed",
      reasons.length ? null : release,
      reasons,
      now,
    ),
  };
}
export function evaluateWithdrawal(
  s,
  {
    now,
    zone = s.operation?.[0]?.timeZone || "Etc/UTC",
    detectBackward = true,
    administrationClock = now,
  } = {},
) {
  const instant = ms(now);
  if (!Number.isFinite(instant))
    throw new Error("Supply a valid calculation clock.");
  const clockAlert = detectBackward
    ? clockState(s.metadata?.[0], now).reviewRequired
    : !!s.metadata?.[0]?.clockReviewRequired;
  const byAnimal = new Map(),
    coursesByAnimal = new Map(),
    movementsByAnimal = new Map();
  for (const [rows, map] of [
    [s.treatments, byAnimal],
    [s.treatmentCourses, coursesByAnimal],
    [s.movements || [], movementsByAnimal],
  ])
    for (const row of rows) {
      if (!map.has(row.animalId)) map.set(row.animalId, []);
      map.get(row.animalId).push(row);
    }
  const animals = s.animals.map((animal) => {
    const treatments = (byAnimal.get(animal.id) || []).filter(
      (t) => t.animalId === animal.id && !t.voidedAt,
    );
    const row = { animal };
    for (const commodity of ["meat", "milk"]) {
      const contributions = treatments.map((t) =>
        contribution(
          t,
          commodity,
          s,
          instant,
          clockAlert,
          ms(administrationClock),
        ),
      );
      // Empty open courses still hold, since neither applicability nor a final dose is known.
      for (const c of (coursesByAnimal.get(animal.id) || []).filter(
        (c) =>
          c.animalId === animal.id &&
          !c.voidedAt &&
          !treatments.some((t) => t.courseId === c.id),
      ))
        contributions.push({
          course: c,
          ...result(
            "needs-review",
            null,
            ["course has no completed administration"],
            instant,
          ),
        });
      const applicable = contributions.filter(
        (c) => c.status !== "not-applicable",
      );
      const reasons = [...new Set(applicable.flatMap((c) => c.reasons))];
      const releases = applicable
        .map((c) => ms(c.releaseAt))
        .filter(Number.isFinite);
      const release = releases.length ? Math.max(...releases) : null;
      const status = applicable.some((c) => c.status === "needs-review")
        ? "needs-review"
        : release !== null
          ? instant < release
            ? "held"
            : "elapsed"
          : contributions.length
            ? "not-applicable"
            : "no-recorded-interval";
      row[commodity] = {
        ...result(
          status,
          status === "needs-review" ? null : release,
          reasons,
          instant,
        ),
        contributions,
      };
    }
    row.needsReview = [row.meat, row.milk].some(
      (c) => c.status === "needs-review",
    );
    row.departureAlert =
      (movementsByAnimal.get(animal.id) || []).some(
        (m) =>
          m.animalId === animal.id &&
          !m.voidedAt &&
          m.holdAcknowledgment &&
          [
            m.holdAcknowledgment.meatStatus,
            m.holdAcknowledgment.milkStatus,
          ].some(isHold),
      ) ||
      (animal.status !== "active" &&
        [row.meat.status, row.milk.status].some(isHold));
    return row;
  });
  return {
    calculatedAt: iso(instant),
    zone,
    clockReviewRequired: clockAlert,
    animals,
    counts: {
      meat: animals.filter((r) => isHold(r.meat.status)).length,
      milk: animals.filter((r) => isHold(r.milk.status)).length,
      review: animals.filter((r) => r.needsReview).length,
    },
  };
}
export function localParts(instant, zone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
// Explicit offset is mandatory, including either side of a repeated DST hour.
export function enteredInstant(local, zone, offset) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local) ||
    offset === "" ||
    offset === null ||
    offset === undefined ||
    !Number.isInteger(Number(offset)) ||
    Math.abs(Number(offset)) > 840
  )
    throw new Error(
      "Enter local time, zone and an explicit UTC offset in minutes.",
    );
  const instant = iso(ms(local + "Z") - Number(offset) * 60000);
  if (localParts(instant, zone) !== local)
    throw new Error("Time zone/offset conflict or nonexistent local time.");
  return instant;
}
export function startOfDay(date, zone) {
  // Enumerate possible offsets, choosing the earliest instant of the farm day.
  // Handles midnight gaps and repeated midnight without the device's local zone.
  const base = ms(date + "T00:00:00.000Z");
  if (!Number.isFinite(base) || iso(base).slice(0, 10) !== date)
    throw new Error("Choose a valid departure date.");
  for (let minute = -840; minute <= 2280; minute++) {
    const candidate = base + minute * 60000;
    if (localParts(candidate, zone).slice(0, 10) === date)
      return iso(candidate);
  }
  throw new Error("This calendar day does not exist in the farm time zone.");
}
export function departurePreview(s, animalId, date, now) {
  const eventAt = startOfDay(date, s.operation[0].timeZone);
  // Same-day doses remain included conservatively. Later calendar dates do not.
  const eventData = {
    ...s,
    treatments: s.treatments.filter((t) => t.administrationDate <= date),
    treatmentCourses: s.treatmentCourses.filter((c) =>
      s.treatments.some(
        (t) => t.courseId === c.id && t.administrationDate <= date,
      ),
    ),
  };
  const event = evaluateWithdrawal(eventData, {
    now: eventAt,
    detectBackward: false,
    administrationClock: now,
  }).animals.find((r) => r.animal.id === animalId);
  const current = evaluateWithdrawal(s, { now }).animals.find(
    (r) => r.animal.id === animalId,
  );
  return {
    eventAt,
    event,
    current,
    treatmentIds: eventData.treatments
      .filter((t) => t.animalId === animalId && !t.voidedAt)
      .map((t) => t.id),
  };
}
export function departureText(preview) {
  return `${DEPARTURE_NOTICE}\nEvent time (date-only-conservative): ${preview.eventAt}. Meat: ${preview.event.meat.label}; milk: ${preview.event.milk.label}.\nCurrent meat: ${preview.current.meat.label}; milk: ${preview.current.milk.label}.`;
}
