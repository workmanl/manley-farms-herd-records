# Render-check status

Verified 2026-10-12 with Playwright 1.64.0 (Chromium headless shell, revision 1248) on macOS arm64. The app was served to the browser by request interception from `app/` on disk; no web server was used. See `tests/render-check.mjs`.

| Viewport | Result |
|---|---|
| 390x844 | First-run gate renders. Accepting it stores the acknowledgment ("Acknowledgment saved on this device"). Backup & Settings renders. scrollWidth = 390 (no horizontal overflow). |
| 1280x900 | Same flow. scrollWidth = 1280. |

There were no page errors, no console errors and no external network requests.

Screenshots: `first-run-390x844.png`, `backup-390x844.png`, `first-run-1280x900.png`, `backup-1280x900.png`.

Still not covered here: restore conflict preview, keyboard focus, the sunlight theme, stale-tab errors, VoiceOver/TalkBack, and real devices.

Run it again with `node tests/render-check.mjs app docs/screens`. It needs playwright installed in the environment, which is not a project dependency.
