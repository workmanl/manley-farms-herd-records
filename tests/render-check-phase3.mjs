// Phase 3 render check: walk the main tabs at 320/390/1280 and report overflow and errors. Serves app/ from disk via interception.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const APP = process.argv[2], OUT = process.argv[3];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const browser = await chromium.launch();
const problems = [];
for (const [w, h] of [[320, 700], [390, 844], [1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${w}: pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`${w} console: ${m.text()}`));
  await page.route("https://herd.test/**", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/+/, "") || "index.html";
    const f = path.join(APP, p);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, contentType: types[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  await page.route((u) => !u.href.startsWith("https://herd.test/"), (r) => { problems.push(`${w} external: ${r.request().url()}`); r.abort(); });
  await page.goto("https://herd.test/index.html");
  await page.waitForTimeout(600);
  const box = page.locator("input[type=checkbox]").first();
  if (await box.count()) { await box.check(); await page.getByRole("button", { name: /acknowledge/i }).first().click().catch(() => {}); }
  await page.waitForTimeout(500);
  for (const tab of ["Dashboard", "Animals", "Events"]) {
    const t = page.getByRole("link", { name: new RegExp(`^${tab}$`, "i") }).or(page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") })).or(page.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") })).first();
    if (!(await t.count())) { problems.push(`${w}: no ${tab} tab`); continue; }
    await t.click(); await page.waitForTimeout(500);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) problems.push(`${w}: ${tab} overflows (${sw}px)`);
    await page.screenshot({ path: `${OUT}/${tab.toLowerCase()}-${w}.png`, fullPage: true });
  }
  // Open the add-animal form if present.
  const add = page.getByRole("button", { name: /add animal|new animal/i }).or(page.getByRole("link", { name: /add animal|new animal/i })).first();
  if (await add.count()) { await add.click(); await page.waitForTimeout(500); const sw = await page.evaluate(() => document.documentElement.scrollWidth); if (sw > w) problems.push(`${w}: add-animal overflows (${sw}px)`); await page.screenshot({ path: `${OUT}/add-animal-${w}.png`, fullPage: true }); }
  else problems.push(`${w}: no add-animal control found`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "OK: no overflow, no errors, no external requests");
