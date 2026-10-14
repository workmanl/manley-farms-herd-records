// SPDX-License-Identifier: AGPL-3.0-only
export const DEVICE_KEY = 'manley-herd-device-v1';
const WEEK = 7 * 86400000;
const volatile = new WeakMap();
const absentStorage = {};
const cacheKey = storage => storage && typeof storage === 'object' ? storage : absentStorage;
export function readDevice(storage) {
  const cached = volatile.get(cacheKey(storage));
  if (cached) return cached;
  try {
    const parsed = JSON.parse(storage?.getItem(DEVICE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
export function writeDevice(storage, patch) {
  const value = {...readDevice(storage), ...patch};
  // Keep weekly retry and share proof for this session even when settings cannot be stored.
  try {
    if (typeof storage?.setItem !== 'function') throw Error('Settings unavailable');
    storage.setItem(DEVICE_KEY, JSON.stringify(value));
    volatile.delete(cacheKey(storage));
  } catch { volatile.set(cacheKey(storage), value); }
}
export function persistDue(device, now = Date.now()) {
  return !device.persistRetryAt || now >= device.persistRetryAt;
}
// Called only after a saved animal or successful copy. Never during startup.
export async function keepRecords(storageAPI, storage, now = Date.now()) {
  try {
    if (await storageAPI?.persisted?.()) return true;
    if (!storageAPI?.persist || !persistDue(readDevice(storage), now)) return false;
    // Write first so concurrent saves and a thrown request also respect the retry limit.
    writeDevice(storage, {persistRetryAt: now + WEEK});
    const kept = await storageAPI.persist();
    if (kept) writeDevice(storage, {persistRetryAt: null});
    return !!kept;
  } catch { return false; }
}
export function safariTab({agent = '', standalone = false, touchPoints = 0} = {}) {
  return !standalone && (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touchPoints > 1))
    && /Safari/.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(agent);
}
export const SAFARI_WARNING = 'Safari may clear records after 7 days of use with no visit here. Add this app to your Home Screen.';
export const SAFARI_STEPS = [
  'Save a copy here first.',
  'In Safari, tap Share, then Add to Home Screen.',
  'Open the Home Screen app and pick I have a backup.',
];
export const SAFARI_SEPARATE = 'Safari and the Home Screen app keep their own records. Save a copy here, then open the Home Screen app.';
