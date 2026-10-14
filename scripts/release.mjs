// Local-only release packaging. Requires the system zip executable, no dependencies.
import { readdir, readFile, writeFile, mkdir, rm, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw Error("Invalid release version");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const excludedDirs = new Set(["node_modules", "dist", ".git", ".agents", ".codex", ".aws", "coverage", "test-results", "playwright-report"]);
const excludedFile = (path) => ["docs/phase6-performance.json", "docs/phase6-scale-results.txt"].includes(path) || /(?:^|\/)(?:\.DS_Store|\.env(?:\..*)?|.*\.log)$/.test(path)
  || /(?:^|\/)(?:herd-twenty-year|scale-fixture|scale-artifact|test-scale)[^/]*\.(?:json|zip)$/i.test(path);
async function filesIn(directory, { source = false } = {}) {
  const files = [];
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name), rel = relative(directory, path);
      // Do not follow symlinks or include local private tooling.
      if (entry.isSymbolicLink()) throw Error(`Symlink is not a release file: ${rel}`);
      if (source && (excludedDirs.has(entry.name) || excludedFile(rel))) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(rel);
      else throw Error(`Unsupported release entry: ${rel}`);
    }
  }
  await walk(directory);
  return files.sort();
}
const app = join(root, "app");
const appFiles = await filesIn(app);
const context = { self: {} };
vm.runInNewContext(await readFile(join(app, "precache.js"), "utf8"), context);
const release = context.self.HERD_RELEASE;
const assets = appFiles.filter((p) => p !== "precache.js");
if (JSON.stringify(assets) !== JSON.stringify(Array.from(release.assets, (a) => a.path))) throw Error("Precache inventory differs from app files. Regenerate it.");
for (const asset of release.assets)
  if (sha(await readFile(join(app, asset.path))) !== asset.sha256) throw Error(`Stale precache hash: ${asset.path}`);
const expectedVersion = `${version}:${sha(JSON.stringify(release.assets)).slice(0, 20)}`;
if (release.version !== expectedVersion) throw Error("Precache release version does not match package and asset bytes.");
// Packaging stays local by default. Maintainers explicitly run the live gate after an update.
const gateIndex = process.argv.indexOf('--upgrade-check');
if (gateIndex !== -1) {
  const args = process.argv.slice(gateIndex + 1);
  if (args.length !== 3) throw Error('Use --upgrade-check BASE_URL PROFILE_DIR OUT_DIR');
  const gate = spawnSync(process.execPath, [join(root, 'tests/live-upgrade-check.mjs'), 'check', ...args, '1', version], {stdio:'inherit'});
  if (gate.error || gate.status !== 0) throw gate.error || Error('Upgrade gate failed. Release stopped.');
}
const output = resolve(root, "dist");
await mkdir(output, { recursive: true });
async function archive(kind, files) {
  if (files.some((p) => /[\r\n]/.test(p))) throw Error("Archive filenames must not contain newlines");
  const name = `manley-farms-herd-records-${version}-${kind}.zip`, path = join(output, name);
  // Remove a previous archive so zip cannot retain files that were removed from the source.
  await rm(path, { force: true });
  const result = spawnSync("zip", ["-q", "-X", path, "-@"], { cwd: root, input: files.join("\n") + "\n", encoding: "utf8" });
  if (result.error || result.status !== 0) throw result.error || Error(result.stderr || `zip exited ${result.status}`);
  if (!(await lstat(path)).isFile()) throw Error("Archive was not written");
  const sums = `${sha(await readFile(path))}  ${name}\n`;
  await writeFile(join(output, `manley-farms-herd-records-${version}-${kind}-SHA256SUMS`), sums);
  return sums;
}
const staticSums = await archive("static", appFiles.map((p) => `app/${p}`));
const sourceSums = await archive("source", await filesIn(root, { source: true }));
await writeFile(join(output, "SHA256SUMS"), staticSums + sourceSums);
console.log(`Prepared ${version} static/source ZIPs and SHA256SUMS in dist/. No app files changed.`);
