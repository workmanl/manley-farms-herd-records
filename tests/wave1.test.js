// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {JSDOM} from 'jsdom';
import {openRepository, emptyDataset} from '../app/lib/database.js';
import {exportBackup, verifyBackup, previewRestore, commitRestore, sha256} from '../app/lib/backup.js';
import {prepareCopy, saveCopy, checkCopy} from '../app/lib/save-copy.js';
import {backupHealth, healthFromSnapshot} from '../app/lib/backup-health.js';
import {keepRecords, persistDue, safariTab, readDevice, DEVICE_KEY} from '../app/lib/device-safety.js';
import {readSafeFile, MAX_FILE_BYTES, backupError} from '../app/lib/file-safety.js';
import {parseCSV} from '../app/lib/csv.js';
import {validateDataset} from '../app/lib/validation.js';
import {PRINT_FOOTER, assembleReport, renderReport} from '../app/lib/reports.js';
import {SEED_FIELDS, assertUpgrade} from './upgrade-gate.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/sample-herd.json',import.meta.url)));
const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
async function loaded() {
  const repo=await openRepository({factory:new IDBFactory()});
  const safetyBackup=await exportBackup(repo);
  await commitRestore(repo,await previewRestore(repo,fixture),{safetyBackup,downloadConfirmed:true});
  return repo;
}
for(const scenario of ['share','cancel','txt','download','share-failed']) test('verified copy: '+scenario, async()=>{
  const repo=await loaded();
  try {
    const before=await repo.snapshot(), copy=await prepareCopy(repo,'2026-10-13T12:00:00.000Z');
    const calls=[], downloads=[];
    const nav=scenario==='download'?{}:{canShare:({files})=>scenario==='txt'?files[0].type==='text/plain':true,
      share:({files})=>{calls.push(files[0]);return scenario==='cancel'?Promise.reject(Object.assign(Error('cancel'),{name:'AbortError'}))
        :scenario==='share-failed'?Promise.reject(Error('unsupported')):Promise.resolve();}};
    const result=await saveCopy(repo,copy,{navigator:nav,download:f=>downloads.push(f),now:'2026-10-13T12:01:00.000Z'});
    const after=await repo.snapshot();
    if(['share','txt'].includes(scenario)) {
      assert.equal(result.kind,'shared');assert.equal(after.metadata[0].lastUserConfirmedBackupAt,'2026-10-13T12:01:00.000Z');
      assert.equal(after.metadata[0].lastExportAttemptAt,before.metadata[0].lastExportAttemptAt);
      assert.equal(after.metadata[0].lastVerifiedBackupAt,before.metadata[0].lastVerifiedBackupAt);
    } else {assert.deepEqual(after,before);assert.equal(result.kind,scenario==='cancel'?'cancelled':'download');}
    const file=calls.at(-1)||downloads[0]||copy.json;
    assert.equal(file.name,scenario==='txt'?'Herd backup 2026-10-13.txt':'Herd backup 2026-10-13.json');
    const bytes=await file.text();const {backup}=await verifyBackup(bytes);
    const other=await openRepository({factory:new IDBFactory()});
    try {
      await commitRestore(other,await previewRestore(other,bytes),{safetyBackup:await exportBackup(other),downloadConfirmed:true});
      const restored=await exportBackup(other);
      for(const store of Object.keys(backup.stores)) assert.equal(await sha256(JSON.stringify(restored.stores[store])),await sha256(JSON.stringify(backup.stores[store])),store);
    } finally {other.close();}
  } finally {repo.close();}
});
test('canShare false uses download and never calls share; forged copies are refused',async()=>{
  const repo=await loaded();try {
    let downloaded=0, shared=0;const copy=await prepareCopy(repo);
    await saveCopy(repo,copy,{navigator:{canShare:()=>false,share:()=>shared++},download:()=>downloaded++});
    assert.equal(downloaded,1);assert.equal(shared,0);
    await assert.rejects(saveCopy(repo,{...copy},{navigator:{},download:()=>{}}),/ready/);
  }finally{repo.close();}
});
test('check my copy is read-only except receipt; old and damaged copies cannot turn green',async()=>{
  const repo=await loaded();try {
    const bytes=await (await prepareCopy(repo)).json.text(), before=await repo.snapshot();
    await checkCopy(repo,bytes,'2026-10-13T12:00:00.000Z');
    const after=await repo.snapshot();
    for(const store of Object.keys(before).filter(k=>k!=='metadata')) assert.deepEqual(after[store],before[store]);
    assert.equal(after.metadata[0].lastVerifiedBackupAt,'2026-10-13T12:00:00.000Z');
    assert.equal(after.metadata[0].lastUserConfirmedBackupAt,null);
    const a=after.animals[0];await repo.mutate([{store:'animals',expectedRevision:a.revision,record:{...a,notes:'New note',revision:a.revision+1,updatedAt:'2026-10-13T12:02:00.000Z'}}],{reason:'Test note'});
    const changed=await repo.snapshot();
    await assert.rejects(checkCopy(repo,bytes),/older than/);
    await assert.rejects(checkCopy(repo,bytes.replace('Demo','Changed')));
    assert.deepEqual(await repo.snapshot(),changed);
    repo.recovery=true;await assert.rejects(checkCopy(repo,bytes),/read-only/);
  }finally{repo.close();}
});
const NOW=Date.parse('2026-10-13T12:00:00.000Z');
for(const [name,meta,context,color] of [
  ['no copy',{}, {},'red'],['download only',{lastExportAttemptAt:'2026-10-13T11:00:00.000Z'}, {},'red'],
  ['shared',{lastUserConfirmedBackupAt:'2026-10-13T11:00:00.000Z'}, {},'green'],
  ['checked',{lastVerifiedBackupAt:'2026-10-13T11:00:00.000Z'}, {},'green'],
  ['new work',{lastVerifiedBackupAt:'2026-10-13T11:00:00.000Z'}, {changedAt:'2026-10-13T11:30:00.000Z'},'yellow'],
  ['old copy',{lastVerifiedBackupAt:'2026-10-01T11:00:00.000Z'}, {},'yellow'],
  ['clock went back',{lastVerifiedBackupAt:'2026-10-14T11:00:00.000Z'}, {},'red'],
  ['Safari',{lastVerifiedBackupAt:'2026-10-13T11:00:00.000Z'}, {safari:true},'red'],
]) test('backup light: '+name,()=>assert.equal(backupHealth(meta,{animals:12,treatments:9},context,NOW).color,color));
test('backup light finds changed records without treating copy bookkeeping as work',async()=>{
  const repo=await loaded();try {
    const b=await exportBackup(repo);await checkCopy(repo,b,'2026-10-13T11:00:00.000Z');
    assert.equal(healthFromSnapshot(await repo.snapshot(),{},NOW).color,'green');
    const s=await repo.snapshot();s.animals[0].updatedAt='2026-10-13T11:30:00.000Z';
    assert.equal(healthFromSnapshot(s,{},NOW).color,'yellow');
  }finally{repo.close();}
});
function memory(){const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};}
test('persist weekly retries, already kept, missing and throwing APIs never block',async()=>{
  const storage=memory();let requests=0;
  const api={persisted:async()=>false,persist:async()=>{requests++;return false;}};
  assert.equal(await keepRecords(api,storage,NOW),false);
  assert.equal(await keepRecords(api,storage,NOW+1),false);assert.equal(requests,1);
  assert.equal(persistDue(readDevice(storage),NOW+7*86400000),true);
  await keepRecords(api,storage,NOW+7*86400000);assert.equal(requests,2);
  assert.equal(await keepRecords({persisted:async()=>true,persist:()=>{throw Error('not called');}},storage,NOW),true);
  assert.equal(await keepRecords({},storage),false);
  assert.equal(await keepRecords({persisted:()=>{throw Error('failure');}},storage),false);
  assert.equal(await keepRecords({persisted:async()=>false,persist:()=>Promise.reject(Error('failure'))},memory()),false);
  assert.deepEqual(readDevice({getItem:()=>'{bad'}),{});
  assert.equal(await keepRecords({persist:async()=>true},{getItem:()=>{throw Error('private');},setItem:()=>{throw Error('private');}}),true);
  assert.equal(typeof DEVICE_KEY,'string');
});
for(const [agent,standalone,touchPoints,expected] of [
  ['iPhone AppleWebKit Safari',false,0,true],['iPad AppleWebKit Safari',false,0,true],
  ['Macintosh AppleWebKit Safari',false,5,true],['Macintosh Safari',false,0,false],
  ['iPhone Safari',true,0,false],['iPhone CriOS Safari',false,0,false],
  ['iPhone FxiOS Safari',false,0,false],['Android Chrome Safari',false,0,false],
]) test('Safari tab detection: '+agent+' '+standalone,()=>assert.equal(safariTab({agent,standalone,touchPoints}),expected));
test('large files rejected without a read; import-only text cap leaves long old notes valid',async()=>{
  let reads=0;await assert.rejects(readSafeFile({size:MAX_FILE_BYTES+1,text:()=>{reads++;}}),/too big/);assert.equal(reads,0);
  assert.equal(await readSafeFile({size:2,text:async()=> 'ok'}),'ok');
  assert.throws(()=>parseCSV('notes\n'+ 'x'.repeat(10001)),/too long/);
  const s=structuredClone(fixture.stores);s.animals[0].notes='x'.repeat(20000);
  assert.doesNotThrow(()=>validateDataset(s,{acknowledgeDuplicateTags:true,acknowledgeParentSex:true}));
  assert.match(backupError(Error('Checksum mismatch')),/changed or damaged/);
});
test('report footer URL points to a bundled file, including all URL-shaped text',()=>{
  const urls=PRINT_FOOTER.match(/(?:https?:\/\/)?herd\.manleyfarms\.com\/[^\s]+/g)||[];
  assert.ok(urls.length);
  for(const text of urls) {
    const url=new URL('https://'+text.replace(/^https?:\/\//,'').replace(/\.$/,''));
    assert.equal(url.hostname,'herd.manleyfarms.com');
    assert.ok(url.pathname.startsWith('/'));
    assert.ok(fs.statSync(new URL('../app/'+url.pathname.slice(1),import.meta.url)).isFile(),text);
  }
});
test('new herds use Sunlight, all copy pickers accept text, signup recipient and CSP are explicit',()=>{
  assert.equal(emptyDataset().operation[0].theme,'sunlight');
  const dom=new JSDOM(read('app/index.html')), d=dom.window.document;
  for(const id of ['verify-file','restore-file','safety-file','update-backup-file']) assert.match(d.getElementById(id).accept,/\.txt.*text\/plain/);
  assert.match(d.getElementById('news-signup').textContent,/Signing up happens on manleyfarms\.com/);
  assert.equal(d.querySelector('[http-equiv="Content-Security-Policy"]').content.match(/connect-src ([^;]+)/)[1],"'self'");
  assert.equal(d.getElementById('backup-light').parentElement.id,'backup');
  dom.window.close();
});
test('upgrade detector fails on every changed seeded field, removed record, DB version and page error',()=>{
  const expected={record:{...SEED_FIELDS,id:'synthetic'},stores:{animals:[{...SEED_FIELDS}]},dbVersion:1};
  assert.doesNotThrow(()=>assertUpgrade(expected,expected,[],1));
  for(const field of Object.keys(SEED_FIELDS)) assert.throws(()=>assertUpgrade(expected,{...expected,record:{...expected.record,[field]:'corrupt'}},[],1));
  assert.throws(()=>assertUpgrade(expected,{...expected,record:null},[],1));
  assert.throws(()=>assertUpgrade(expected,{...expected,dbVersion:2},[],1));
  assert.throws(()=>assertUpgrade(expected,expected,['page error'],1));
  assert.throws(()=>assertUpgrade(expected,{...expected,stores:{animals:[]}},[],1));
});
test('Wave 1 source has no em dash and persistence is behind the save helper',()=>{
  for(const path of ['app/lib/save-copy.js','app/lib/backup-health.js','app/lib/device-safety.js','app/lib/file-safety.js','app/app.js']) assert.doesNotMatch(read(path),/\u2014/);
  assert.doesNotMatch(read('app/app.js'),/\.persist\(/);
  assert.match(read('app/lib/device-safety.js'),/await storageAPI\.persist\(\)/);
  assert.match(read('app/styles.css'),/#herd \.guided-form \.sticky \{\s*position: static/);
});
test('every URL in all printed report types resolves to app files',()=>{
  const dom=new JSDOM('<main></main>'), root=dom.window.document.querySelector('main');
  for(const type of ['treatments','calvings','animal']) {
    renderReport(root,assembleReport(fixture.stores,{type,animalId:fixture.stores.animals[0].id,now:'2026-10-13T12:00:00.000Z'}));
    const urls=root.textContent.match(/(?:https?:\/\/[^\s]+|herd\.manleyfarms\.com\/[^\s]+)/g)||[];
    assert.ok(urls.length,type);
    for(const value of urls) {
      const url=new URL(value.startsWith('http')?value:'https://'+value.replace(/\.$/,''));
      const path=url.pathname.replace(/^\/tools\/herd-records\//,'');
      assert.ok(fs.statSync(new URL('../app/'+path,import.meta.url)).isFile(),value);
    }
  }
  dom.window.close();
});
test('guide scrolls its question on each step, both themes keep the same controls',async()=>{
  const {guideForm}=await import('../app/lib/guided-form.js');
  for(const theme of ['sunlight','dark']) {
    const dom=new JSDOM(`<html data-theme="${theme}"><form><div class="fields"><label>Farm ID<input name="farmId" required></label><label>Sex<select name="sex"><option>Female</option></select></label></div><div class="sticky"><div class="actions"><button type="submit">Save</button><a href="#dashboard">Back</a></div></div></form></html>`);
    const form=dom.window.document.querySelector('form');let scrolled=0;
    dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolled++;};
    guideForm(form);assert.equal(scrolled,1);
    form.elements.farmId.value='001';[...form.querySelectorAll('button')].find(b=>b.textContent==='Next').click();
    assert.ok(scrolled>1);assert.equal(dom.window.document.activeElement.className,'guide-question');assert.match(dom.window.document.activeElement.textContent,/Male, female or steer/);
    assert.equal(form.querySelectorAll('label:not([hidden])').length,1);
    dom.window.close();
  }
});
test('new backup messages use short plain sentences without technical codes',async()=>{
  const {SAFARI_WARNING,SAFARI_STEPS,SAFARI_SEPARATE}=await import('../app/lib/device-safety.js');
  const texts=[SAFARI_WARNING,SAFARI_SEPARATE,...SAFARI_STEPS,
    ...['red','yellow','green'].map(color=>backupHealth(color==='red'?{}:{lastVerifiedBackupAt:color==='yellow'?'2026-10-01T12:00:00.000Z':'2026-10-13T11:00:00.000Z'},{}, {},NOW).text),
    backupError(Error('damaged'))];
  for(const text of texts) {
    assert.doesNotMatch(text,/\b(JSON|schema|dataset|checksum|UTC|ISO|manifest)\b|\u2014/);
    const words=text.match(/[A-Za-z]+|\d+/g) || [], sentences=text.split(/[.!?]/).filter(s=>s.trim()).length;
    const syllables=word=>{
      let w=word.toLowerCase().replace(/[^a-z]/g,'');
      if(w.length<=3)return 1;
      w=w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/,'').replace(/^y/,'');
      return Math.max(1,(w.match(/[aeiouy]{1,2}/g)||[]).length);
    };
    const grade=.39*words.length/sentences + 11.8*words.reduce((n,w)=>n+syllables(w),0)/words.length - 15.59;
    assert.ok(grade<=6,`Reading grade estimate ${grade}: ${text}`);
    for(const sentence of text.split(/[.!?]/).filter(s=>s.trim())) assert.ok(sentence.trim().split(/\s+/).length<=20,sentence);
  }
});
test('practice restore previews the file and never replaces live records',async()=>{
  const {practiceCopy}=await import('../app/lib/save-copy.js');
  const repo=await loaded();try {
    const before=await repo.snapshot(), backup=await exportBackup(repo);
    const counts=await practiceCopy(repo,backup,'2026-10-13T12:00:00.000Z');
    assert.equal(counts.animals,12);
    const after=await repo.snapshot();
    for(const name of Object.keys(before).filter(n=>n!=='metadata')) assert.deepEqual(after[name],before[name]);
    assert.equal(after.metadata[0].lastVerifiedBackupAt,'2026-10-13T12:00:00.000Z');
    const damaged=structuredClone(backup);damaged.counts.animals=0;
    await assert.rejects(practiceCopy(repo,damaged));assert.deepEqual(await repo.snapshot(),after);
  }finally{repo.close();}
});
test('release packaging stops before ZIP creation when the upgrade gate fails',async()=>{
  const {mkdtemp,cp,mkdir,writeFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {spawnSync}=await import('node:child_process');
  const dir=await mkdtemp(join(tmpdir(),'herd-gate-stop-'));
  try {
    await mkdir(join(dir,'scripts'));await mkdir(join(dir,'tests'));
    await cp(new URL('../scripts/release.mjs',import.meta.url),join(dir,'scripts/release.mjs'));
    await cp(new URL('../app/',import.meta.url),join(dir,'app'),{recursive:true});
    await cp(new URL('../package.json',import.meta.url),join(dir,'package.json'));
    // A local failing stub avoids Playwright and every network request.
    await writeFile(join(dir,'tests/live-upgrade-check.mjs'),'process.exitCode = 1;\n');
    const result=spawnSync(process.execPath,[join(dir,'scripts/release.mjs'),'--upgrade-check','https://synthetic.test/','profile','out'],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/Upgrade gate failed/);
    assert.equal(fs.existsSync(join(dir,'dist')),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('blocked device settings still limit refused persist calls in this session',async()=>{
  let requests=0;
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  const api={persisted:async()=>false,persist:async()=>{requests++;return false;}};
  await keepRecords(api,blocked,NOW);await keepRecords(api,blocked,NOW+1000);
  assert.equal(requests,1);
  await keepRecords(api,blocked,NOW+7*86400000);assert.equal(requests,2);
});
