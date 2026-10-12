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
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith("#")) {
      assert.doesNotMatch(match[1], /^https?:/);
      assert.ok(fs.existsSync(new URL("../app/" + match[1], import.meta.url)));
    }
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
test("no runtime dependency, build step, remote connection or HTML injection sink", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies), [
    "fake-indexeddb",
    "jsdom",
  ]);
  const source = [
    "app/app.js",
    ...fs
      .readdirSync(new URL("../app/lib/", import.meta.url))
      .filter((p) => p.endsWith(".js"))
      .map((p) => "app/lib/" + p),
  ]
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    source,
    /innerHTML|eval\(|fetch\(|XMLHttpRequest|WebSocket/,
  );
  assert.match(read("app/index.html"), /connect-src 'none'/);
});
