import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { APP_VERSION } from "../app/lib/database.js";
import { FULL_TERMS, TERMS_VERSION } from "../app/lib/terms-copy.js";
import { updateIntroduction } from "../app/lib/landing.js";
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const dom = () => new JSDOM(read("app/index.html"));
const graph = () => JSON.parse(dom().window.document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
const version = "1.6.1-beta.1";
test("public beta version agrees across package, app, structured data and hash-derived worker release", () => {
  assert.equal(JSON.parse(read("package.json")).version, version);
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  assert.equal(APP_VERSION, version);
  assert.ok(dom().window.document.querySelector('.badge').textContent.includes(version));
  assert.equal(graph().find((n) => n['@type'] === 'SoftwareApplication').softwareVersion, version);
  assert.equal(graph().find((n) => n['@type'] === 'SoftwareSourceCode').version, version);
  const context = { self: {} };
  vm.runInNewContext(read("app/precache.js"), context);
  const release = context.self.HERD_RELEASE;
  const hash = createHash('sha256').update(JSON.stringify(release.assets)).digest('hex').slice(0, 20);
  assert.equal(release.version, `${version}:${hash}`);
  assert.match(read("CHANGELOG.md"), /## 1\.0\.0-beta\.1/);
});
test("JSON-LD FAQ matches every visible question and answer exactly", () => {
  const document = dom().window.document;
  const visible = [...document.querySelectorAll('#public-faq article')].map((a) => ({question:a.querySelector('h3').textContent, answer:a.querySelector('p').textContent}));
  const structured = graph().find((n) => n['@type'] === 'FAQPage').mainEntity.map((q) => ({question:q.name,answer:q.acceptedAnswer.text}));
  assert.equal(visible.length, 8);
  assert.deepEqual(structured, visible);
});
test("SEO identifies free beta software and source without ratings or nonexistent image", () => {
  const document = dom().window.document, nodes = graph();
  const app = nodes.find((n) => n['@type'] === 'SoftwareApplication');
  const url = 'https://herd.manleyfarms.com/';
  assert.equal(app.url, url);
  assert.equal(document.querySelector('[rel=canonical]').href, url);
  assert.equal(document.querySelector('[property="og:url"]').content, url);
  assert.equal(app.description, document.querySelector('[name=description]').content);
  assert.equal(app.offers.price, '0');
  assert.equal(app.offers.priceCurrency, 'USD');
  assert.equal(app.license, url+'LICENSE');
  assert.equal(app.applicationCategory, 'BusinessApplication');
  assert.equal(app.operatingSystem, 'Web browser');
  assert.ok(app.featureList.length > 0);
  assert.equal(nodes.find((n) => n['@type'] === 'SoftwareSourceCode').codeRepository, 'https://github.com/workmanl/manley-farms-herd-records');
  assert.doesNotMatch(JSON.stringify(nodes), /aggregateRating|"review"/);
  assert.equal(document.querySelector('[property="og:image"]'), null);
  assert.match(document.querySelector('.landing-copy').textContent, /clinical review and the multi-device field pilot have not been completed/);
});
test("final terms retain beta and protective clauses with no Draft or lawyer-review claim in terms", () => {
  const terms = read('app/terms.txt');
  assert.doesNotMatch(terms, /draft|lawyer.reviewed|attorney review/i);
  assert.equal(terms, 'Manley Farms Herd Records: Terms of Use and Disclaimer\n\n'+FULL_TERMS+'\n');
  assert.equal(TERMS_VERSION, '2026-10-13-beta-1');
  for (const phrase of ['Public beta','Washington State','Assumption of risk','No warranty','as is','Limitation of liability','veterinary, legal or regulatory advice','withdrawal compliance','Recorded interval elapsed','never means safe for slaughter or milk','responsible for making and verifying backups']) assert.ok(terms.includes(phrase),phrase);
  for (const file of ['README.md', 'app/help.html']) assert.match(read(file), /clinical review and the multi-device field pilot have not been completed/);
  assert.match(read('README.md'), /terms are not lawyer-reviewed/);
  for (const file of ['app/index.html','app/help.html','app/source.html']) assert.doesNotMatch(read(file), /Draft Terms/);
});
test("returning datasets collapse intro while static FAQ stays in the DOM; empty metadata does not", () => {
  const document = dom().window.document, intro = document.querySelector('#public-intro');
  const base = { operation:[{name:'Farm'}], metadata:[{id:'metadata'}], animals:[], treatments:[] };
  assert.equal(intro.open, true);
  assert.equal(updateIntroduction(intro,base), false);
  assert.equal(intro.open, true);
  assert.equal(updateIntroduction(intro,{...base,animals:[{status:'archived'}]}), true);
  assert.equal(intro.open, false);
  assert.equal(document.querySelectorAll('#public-faq article').length,8);
  intro.open = true;
  assert.equal(updateIntroduction(intro,{...base,treatments:[{id:'synthetic'}]}),true);
  assert.equal(intro.open,false);
  assert.match(read('app/app.js'), /updateIntroduction\(\$\("public-intro"\), snapshot\)/);
});

test("release packager verifies shell, includes dotfiles, omits local/scale artifacts and preserves app bytes", async () => {
  const { mkdtemp, cp, mkdir, writeFile, rm, readdir, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const temp = await mkdtemp(join(tmpdir(),'herd-release-test-'));
  try {
    await mkdir(join(temp,'scripts'));
    await cp(new URL('../scripts/',import.meta.url), join(temp,'scripts'), {recursive:true});
    await cp(new URL('../hosting/',import.meta.url), join(temp,'hosting'), {recursive:true});
    await cp(new URL('../app/',import.meta.url), join(temp,'app'), {recursive:true});
    await cp(new URL('../package.json',import.meta.url), join(temp,'package.json'));
    await mkdir(join(temp,'.github'));
    await writeFile(join(temp,'.github','test.md'),'public template');
    for (const name of ['node_modules','dist','.git','.aws']) {
      await mkdir(join(temp,name));
      await writeFile(join(temp,name,'exclude.txt'),'private or generated');
    }
    await writeFile(join(temp,'herd-twenty-year.json'),'scale output');
    await mkdir(join(temp,'docs'));
    await writeFile(join(temp,'docs/phase6-performance.json'),'scale timings');
    await writeFile(join(temp,'docs/phase6-scale-results.txt'),'scale results');
    await writeFile(join(temp,'.env'),'local secret');
    const run = () => spawnSync(process.execPath,[join(temp,'scripts/release.mjs')],{encoding:'utf8'});
    const result = run();
    assert.equal(result.status,0,result.stderr);
    for (const [folder,scope,moved] of [['herd-origin','/',false],['moved','/tools/herd-records/',true]]) {
      const directory=join(temp,'dist',folder);
      const manifest=JSON.parse(await readFile(join(directory,'manifest.webmanifest'),'utf8'));
      assert.equal(manifest.id,scope);assert.equal(manifest.scope,scope);assert.equal(manifest.start_url,scope);
      const config=await readFile(join(directory,'lib/deploy-config.js'),'utf8');
      assert.ok(config.includes('"moved":'+moved));
      assert.match(config,/NEW_ADDRESS = 'https:\/\/herd.manleyfarms.com\/'/);
      const generated={self:{}};vm.runInNewContext(await readFile(join(directory,'precache.js'),'utf8'),generated);
      for(const asset of generated.self.HERD_RELEASE.assets) assert.equal(createHash('sha256').update(await readFile(join(directory,asset.path))).digest('hex'),asset.sha256);
      assert.ok(!generated.self.HERD_RELEASE.assets.some(a=>a.path==='.htaccess'));
      const sums=await readFile(join(temp,'dist',`manley-farms-herd-records-${version}-${folder}-SHA256SUMS`),'utf8');
      const name=`manley-farms-herd-records-${version}-${folder}.zip`;
      assert.equal(sums,`${createHash('sha256').update(await readFile(join(temp,'dist',name))).digest('hex')}  ${name}\n`);
      const html=await readFile(join(directory,'index.html'),'utf8');
      const document = new JSDOM(html).window.document;
      assert.equal(document.querySelector('#news-signup-link').getAttribute('href'),'https://manleyfarms.com/herd-records-updates/?from=app');
      assert.equal(document.querySelector('[http-equiv="Content-Security-Policy"]').content.match(/connect-src ([^;]+)/)[1],"'self'");
      assert.ok(!generated.self.HERD_RELEASE.assets.some(a=>a.path==='lib/signup.js'));
      assert.match(html,/id="move-open" class="button" href="https:\/\/herd.manleyfarms.com\/"/);
    }
    assert.ok(fs.existsSync(join(temp,'dist','herd-origin','.htaccess')));
    const staticName = `manley-farms-herd-records-${version}-static.zip`;
    const sourceName = `manley-farms-herd-records-${version}-source.zip`;
    const list = (name) => {
      const result = spawnSync('unzip',['-Z1',join(temp,'dist',name)],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout.trim().split('\n');
    };
    const sourceFiles = list(sourceName);
    assert.ok(sourceFiles.includes('.github/test.md'));
    assert.ok(sourceFiles.includes('scripts/release.mjs'));
    assert.doesNotMatch(sourceFiles.join('\n'), /node_modules|dist\/|\.git\/|\.aws\/|\.env|herd-twenty-year|phase6-performance|phase6-scale-results/);
    const appFiles = (await readdir(join(temp,'app'),{recursive:true,withFileTypes:true})).filter((e)=>e.isFile()).map((e)=>(e.parentPath || e.path).slice(join(temp,'app').length+1)+'/'+e.name).map((p)=>p.replace(/^\//,''));
    assert.deepEqual(list(staticName).sort(),appFiles.map((p)=>'app/'+p).sort());
    for (const path of list(staticName)) {
      const result = spawnSync('unzip',['-p',join(temp,'dist',staticName),path]);
      assert.equal(result.status,0);
      assert.deepEqual(result.stdout,await readFile(join(temp,path)),path);
    }
    for (const [kind,name] of [['static',staticName],['source',sourceName]]) {
      const bytes = await readFile(join(temp,'dist',name));
      const hash = createHash('sha256').update(bytes).digest('hex');
      assert.equal(await readFile(join(temp,'dist',`manley-farms-herd-records-${version}-${kind}-SHA256SUMS`),'utf8'),`${hash}  ${name}\n`);
    }
    // A mixed or edited shell must fail rather than package an unverified release.
    await writeFile(join(temp,'app/help.html'),'changed bytes');
    assert.notEqual(run().status,0);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
