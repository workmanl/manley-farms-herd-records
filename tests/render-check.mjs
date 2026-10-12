// Render the herd app without a web server: requests to https://herd.test/ are answered from app/ on disk.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const APP = process.argv[2], OUT = process.argv[3];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const browser = await chromium.launch();
const errors = [];
for (const [w, h] of [[390, 844], [1280, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(`${w}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${w} console: ${m.text()}`));
  await page.route("https://herd.test/**", (route) => {
    let p = new URL(route.request().url()).pathname.replace(/^\/+/, "") || "index.html";
    const f = path.join(APP, p);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, contentType: types[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  await page.route((u) => !u.href.startsWith("https://herd.test/"), (r) => { errors.push(`${w} external request blocked: ${r.request().url()}`); r.abort(); });
  await page.goto("https://herd.test/index.html");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/first-run-${w}x${h}.png`, fullPage: true });
  // Accept the disclaimer if the gate is present, then show Backup & Settings.
  const box = page.locator('input[type=checkbox]').first();
  if (await box.count()) { await box.check(); const btn = page.getByRole("button", { name: /acknowledge|start|continue/i }).first(); if (await btn.count()) await btn.click(); }
  await page.waitForTimeout(500);
  const tab = page.getByRole("link", { name: /backup/i }).or(page.getByRole("button", { name: /backup/i })).or(page.getByRole("tab", { name: /backup/i })).first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/backup-${w}x${h}.png`, fullPage: true });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`${w}x${h}: scrollWidth=${sw}`);
  await page.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no page errors, no external requests");
