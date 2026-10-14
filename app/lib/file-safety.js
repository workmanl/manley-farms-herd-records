// SPDX-License-Identifier: AGPL-3.0-only
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_ENTRY_TEXT = 10000;
export async function readSafeFile(file) {
  if (!file || file.size > MAX_FILE_BYTES) throw Error('This file is too big. Pick a file under 50 MB. Nothing was changed here.');
  return file.text();
}
export function checkImportText(value) {
  if (typeof value === 'string' && value.length > MAX_ENTRY_TEXT)
    throw Error('This entry is too long. Keep each field under 10,000 letters. Nothing was changed here.');
}
export function backupError(error) {
  if (/too big|too long/.test(error.message)) return error.message;
  if (/Safety backup|does not match|differs|changed in another|Stale restore/.test(error.message))
    return 'Your records changed. Save a new copy and check it. Then try again. Nothing was changed here.';
  return 'This file was changed or damaged. Nothing was changed here. Try another copy.';
}
