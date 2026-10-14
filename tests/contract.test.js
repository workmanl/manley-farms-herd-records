// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { indexes, STORES, models } from "../app/lib/contract.js";
import {
  INTRO,
  CHECKBOX,
  FULL_TERMS,
  TERMS_TEXT,
} from "../app/lib/terms-copy.js";
const read = (p) =>
  fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
test("frozen data dictionary independently matches all implemented stores, fields and indexes", () => {
  const text = read("docs/data-dictionary.md");
  const expected = {};
  for (const section of text.split("## Store `").slice(1)) {
    const name = section.split("`")[0];
    const content = section.split("\n## ")[0];
    expected[name] = [
      ...content.matchAll(/- `(\w+)`: keyPath `(.+)`, unique=(true|false)/g),
    ].map((m) => [m[1], JSON.parse(m[2]), m[3] === "true"]);
    const fields = [
      ...content.split("## Nested")[0].matchAll(/^\| `(\w+)` \| ([^|]+) \|/gm),
    ].map((m) => m[1]);
    assert.deepEqual(fields, Object.keys(models[name]));
  }
  assert.deepEqual(expected, indexes);
  assert.equal(Object.keys(expected).length, 14);
});
test("bundled full terms are exact and hash input contains all required displayed copy", () => {
  assert.equal(
    read("app/terms.txt"),
    "Manley Farms Herd Records: Terms of Use and Disclaimer\n\n" +
      FULL_TERMS +
      "\n",
  );
  for (const part of [INTRO, CHECKBOX, FULL_TERMS])
    assert.ok(TERMS_TEXT.includes(part));
  const html = read("app/index.html");
  assert.match(html, /<input[^>]*id="accept-check"[^>]*>/);
  assert.doesNotMatch(html, /<input[^>]*id="accept-check"[^>]*\bchecked\b/);
  assert.match(html, /<button[^>]*id="accept"[^>]*disabled/);
});
test("deployable app has local assets, all five tabs, exact footer and full matching license", () => {
  const html = read("app/index.html");
  for (const tab of ["dashboard", "animals", "events", "reports", "backup"])
    assert.ok(html.includes(`data-tab="${tab}"`));
  // Navigation and canonical URLs are inert. Runtime assets must be bundled.
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const path = match[1];
    if (path === "/privacy/" || path.startsWith("#") || path.startsWith("../") || path === "REPO_URL" || /^(https?:|mailto:)/.test(path)) continue;
    assert.ok(fs.existsSync(new URL("../app/" + path, import.meta.url)), path);
  }
  assert.ok(
    html
      .replace(/\s+/g, " ")
      .includes(
        "Recordkeeping only. Not veterinary or legal advice. Verify withdrawal instructions and keep backups. Provided as is.",
      ),
  );
  assert.equal(read("LICENSE"), read("app/LICENSE"));
  assert.ok(read("LICENSE").includes("GNU AFFERO GENERAL PUBLIC LICENSE"));
  assert.ok(
    read("LICENSE").includes("17. Interpretation of Sections 15 and 16."),
  );
  assert.ok(read("LICENSE").length > 34000);
});
test("no runtime dependency, build step, record connection or HTML injection sink", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies), [
    "playwright",
    "fake-indexeddb",
    "jsdom",
  ]);
  const source = [
    "app/app.js",
    ...fs
      .readdirSync(new URL("../app/lib/", import.meta.url))
      .filter((p) => p.endsWith(".js") && p !== "signup.js")
      .map((p) => "app/lib/" + p),
  ]
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    source,
    /innerHTML|eval\(|fetch\(|XMLHttpRequest|WebSocket/,
  );
  assert.match(read("app/index.html"), /connect-src 'self' https:\/\/northwestmediasystems\.com\/api\/capture\.php; worker-src 'self'; manifest-src 'self'/);
});

test("site header and navigation equal the home and Tools link contract", async () => {
  const { JSDOM } = await import('jsdom');
  const base = 'https://manleyfarms.com/tools/herd-records/';
  const document = new JSDOM(read('app/index.html'), {url: base}).window.document;
  // Snapshot verified against site-current home and tools/index.html, 2026-10-13.
  const expected = [['Home','/'],['Tools','/tools/'],['Dashboard','/dashboard/'],['Products','/products/'],['Blog','/blog/'],['About','/about/']];
  const links = (selector) => [...document.querySelectorAll(selector)].map(a => [a.textContent.trim(),new URL(a.href).pathname]);
  assert.deepEqual(links('.nav-links a'), expected);
  assert.deepEqual(links('.footer-links a'), [...expected,['Privacy','/privacy/'],['Disclaimer','/disclaimer/'],['Archive','/archive/']]);
  const brand = document.querySelector('.site-header .brand');
  assert.equal(new URL(brand.href).pathname, '/');
  assert.equal(brand.querySelector('img').alt, 'Manley Farms');
  assert.equal(brand.querySelector('span').textContent, 'Manley Farms');
  assert.equal(document.querySelector('.footer-contact a').getAttribute('href'),'mailto:hello@manleyfarms.com');
  for (const asset of document.querySelectorAll('[src],link[rel="stylesheet"]')) {
    const path = asset.getAttribute('src') || asset.getAttribute('href');
    assert.ok(!/^(https?:|\/|\.\.\/)/.test(path), path);
  }
  const css = read('app/styles.css');
  assert.match(css, /\.app-tabs\s*\{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
  assert.match(css, /\.print-hide\s*\{ display: none !important;/);
  assert.doesNotMatch(css, /@import|https?:\/\//);
});
