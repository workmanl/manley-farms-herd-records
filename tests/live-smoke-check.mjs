import { chromium } from "playwright";
const BASE_URL = new URL(process.argv[2]).href;
const OUT = process.argv[3];
if (!OUT) throw Error("Usage: BASE_URL OUT_DIR");
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
const p = await ctx.newPage(); const ext = []; const errs = [];
p.on("request", r => { const u = new URL(r.url()); if (u.origin !== new URL(BASE_URL).origin) ext.push(u.href); });
p.on("pageerror", e => errs.push(e.message));
await p.goto(BASE_URL, { waitUntil: "networkidle" });
const sw = await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 }).then(() => true).catch(() => false);
if (!sw) { await p.reload({ waitUntil: "networkidle" }); }
const ctl = await p.evaluate(() => !!navigator.serviceWorker.controller);
const h1 = await p.textContent("h1"); const ld = await p.$$eval('script[type="application/ld+json"]', s => s.length);
await p.screenshot({ path: OUT + "/live-390.png" });
await ctx.setOffline(true); await p.reload().catch(e => errs.push("offline reload: " + e.message)); await p.waitForTimeout(1500);
const off = await p.evaluate(() => document.querySelector("h1")?.textContent).catch(e => "ERR " + e.message);
console.log(JSON.stringify({ swControlled: ctl, h1, jsonld: ld, offlineH1: off, external: ext, errors: errs }));
await b.close();

if (!ctl || h1 !== off || errs.length || ext.length) process.exitCode = 1;
