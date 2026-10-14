import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {DEPLOY, deployConfig} from '../app/lib/deploy-config.js';
import {openRepository, Repository, transaction} from '../app/lib/database.js';
import {exportBackup, previewRestore, commitRestore} from '../app/lib/backup.js';
import {hasHerdRecords, shouldRedirect, verifyMoveCopy, removeMovedRecords} from '../app/lib/origin-move.js';
import {refreshHealth} from '../app/lib/health.js';
import {prepareCopy, saveCopy} from '../app/lib/save-copy.js';
import {updateAllowed} from '../app/lib/pwa.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function seeded() {
  const repo=await openRepository({factory:new IDBFactory()});
  const safetyBackup=await exportBackup(repo);
  const fixture=JSON.parse(read('tests/fixtures/sample-herd.json'));
  const plan=await previewRestore(repo,fixture);
  await commitRestore(repo,plan,{safetyBackup,downloadConfirmed:true,acknowledgeWarnings:true});
  return new Repository(repo.db,{moved:true});
}
test('base config defaults to root and validates directory paths and HTTPS origins',()=>{
  assert.equal(DEPLOY.basePath,'/');assert.equal(DEPLOY.moved,false);
  assert.equal(deployConfig().url,'https://herd.manleyfarms.com/');
  assert.equal(deployConfig({basePath:'/test/herd/'}).url,'https://herd.manleyfarms.com/test/herd/');
  for(const basePath of ['x/','/x','/../','//','/?q/'])assert.throws(()=>deployConfig({basePath}));
  for(const origin of ['http://farm.test','https://farm.test/path','https://farm.test/?x','https://user@farm.test'])assert.throws(()=>deployConfig({origin}));
});
test('all main-site navigation is absolute; logo and fonts stay bundled',()=>{
  const d=new JSDOM(read('app/index.html'),{url:'https://herd.manleyfarms.com/'}).window.document;
  for(const a of d.querySelectorAll('.site-header a,.footer-links a,.breadcrumb a'))assert.equal(new URL(a.href).origin,'https://manleyfarms.com');
  assert.equal(d.querySelector('.brand img').getAttribute('src'),'images/logo.png');
  assert.match(read('app/styles.css'),/fonts\/.*woff2/);
  assert.equal(d.querySelector('#restore-welcome a').getAttribute('href'),'#backup');
});
test('only an empty, healthy moved origin with no drafts redirects',()=>{
  const empty={operation:[{}],metadata:[{}],animals:[],revisions:[]};
  assert.equal(shouldRedirect(empty,{moved:true}),true);
  for(const options of [{moved:false},{moved:true,drafts:true},{moved:true,recovery:true}])assert.equal(shouldRedirect(empty,options),false);
  for(const name of ['animals','revisions','termsAcceptances','weights'])assert.equal(shouldRedirect({...empty,[name]:[{}]},{moved:true}),false);
  assert.equal(hasHerdRecords(empty),false);
});
test('moved repository rejects mutations, weights, clock writes and restore; refresh is read-only',async()=>{
  const repo=await seeded();try {
    const before=await repo.snapshot();
    await assert.rejects(repo.mutate([]),/read-only/);
    await assert.rejects(repo.appendWeight({}),/read-only/);
    assert.throws(()=>repo.observeClock(new Date().toISOString()),/read-only/);
    assert.throws(()=>transaction(repo.db,'readwrite',()=>{}),/read-only/);
    await assert.rejects(commitRestore(repo,{},{}),/read-only/);
    assert.deepEqual(await refreshHealth(repo),before);
    assert.deepEqual(await repo.snapshot(),before);
  }finally{repo.close();}
});
test('moved Save a copy uses verified bytes and round trips exact record fields without old writes',async()=>{
  const repo=await seeded();const target=await openRepository({factory:new IDBFactory()});
  try {
    const before=await repo.snapshot(),copy=await prepareCopy(repo);let file;
    assert.equal((await saveCopy(repo,copy,{navigator:{},download:f=>{file=f;}})).kind,'download');
    const bytes=await file.text(),plan=await previewRestore(target,bytes);
    await commitRestore(target,plan,{safetyBackup:await exportBackup(target),downloadConfirmed:true,acknowledgeWarnings:true});
    const restored=await target.snapshot();
    for(const name of ['animals','identifiers','calvings','weights','treatments','movements'])assert.deepEqual(restored[name],before[name],name);
    assert.deepEqual(await repo.snapshot(),before);
    await saveCopy(repo,copy,{navigator:{canShare:()=>true,share:async()=>{}},download:()=>assert.fail()});
    assert.deepEqual(await repo.snapshot(),before);
  }finally{repo.close();target.close();}
});
test('moved build never clears records during load, export, check, cancelled share or unconfirmed removal',async()=>{
  const repo=await seeded();try {
    const before=await repo.snapshot(),backup=await exportBackup(repo),copy=await prepareCopy(repo);
    await verifyMoveCopy(repo,backup);
    await assert.rejects(removeMovedRecords(repo),/confirm/);
    await assert.rejects(removeMovedRecords(repo,{confirmed:true,drafts:true}),/drafts/);
    await saveCopy(repo,copy,{navigator:{canShare:()=>true,share:async()=>{throw Object.assign(Error(),{name:'AbortError'});}},download:()=>assert.fail()});
    assert.deepEqual(await repo.snapshot(),before);
    assert.doesNotMatch(read('app/sw.js'),/indexedDB|localStorage|caches\.delete/);
    assert.equal(updateAllowed({dirty:false,drafts:true,busy:false,migration:false}),false);
  }finally{repo.close();}
});
test('manual removal requires a checked current copy and confirmation, then leaves an empty origin',async()=>{
  const repo=await seeded();try {
    await assert.rejects(removeMovedRecords(repo,{confirmed:true}),/fresh copy/);
    await verifyMoveCopy(repo,await exportBackup(repo));
    await removeMovedRecords(repo,{confirmed:true});
    assert.equal(hasHerdRecords(await repo.snapshot()),false);
  }finally{repo.close();}
});
test('HTTP CSP matches meta plus frame-ancestors; hosting has no old-path redirect',()=>{
  const d=new JSDOM(read('app/index.html')).window.document;
  const policy=d.querySelector('[http-equiv="Content-Security-Policy"]').content;
  const headers=read('hosting/herd-origin/.htaccess');
  assert.ok(headers.includes(policy+"; frame-ancestors 'none'"));
  for(const phrase of ['DirectoryIndex index.html','nosniff','no-referrer','camera=(), microphone=(), geolocation=()','max-age=31536000','no-cache'])assert.ok(headers.includes(phrase));
  assert.doesNotMatch(headers,/preload|R=301|tools\/herd/);
  assert.doesNotMatch(read('app/app.js'),/setupNewsSignup\(document\)/);
});
test('moved views keep search, history and report/export controls while entry routes are blocked',async()=>{
  const {HerdUI}=await import('../app/lib/herd-ui.js');
  const {OwnershipUI}=await import('../app/lib/ownership-ui.js');
  const dom=new JSDOM('<main id="herd"></main><section id="reports"></section>',{url:'https://manleyfarms.com/tools/herd-records/'});
  const savedDocument=globalThis.document;globalThis.document=dom.window.document;
  const repo=await seeded();try {
    const s=await repo.snapshot(),root=dom.window.document.getElementById('herd');
    const ui=new HerdUI(root,{repository:()=>repo,refresh:async()=>{},message:()=>{}});
    ui.render(s,'animals');
    assert.equal(root.querySelector('button[type="submit"]').disabled,false);
    ui.render(s,'events');assert.ok(root.textContent.includes('For helpers: full saved record'));
    for(const route of ['animals/new','dashboard/quick/calving','animals/'+s.animals[0].id+'/weight','groups/new','health/clock']) {
      ui.render(s,route);assert.equal(root.querySelector('form'),null);assert.match(root.textContent,/read-only/);
    }
    const reports=dom.window.document.getElementById('reports');
    new OwnershipUI(reports,{repository:()=>repo,refresh:async()=>{},message:()=>{}}).render(s);
    assert.match(reports.textContent,/Print reports/);assert.match(reports.textContent,/Prepare complete CSV export set/);
    assert.doesNotMatch(reports.textContent,/Preview CSV import/);
  }finally{repo.close();dom.window.close();globalThis.document=savedDocument;}
});
test('a changed old record invalidates manual removal even after a file was checked',async()=>{
  const repo=await seeded();try {
    await verifyMoveCopy(repo,await exportBackup(repo));
    // Simulate a still-open prior release tab, outside the moved repository.
    await new Promise((resolve,reject)=>{
      const tx=repo.db.transaction('animals','readwrite'),store=tx.objectStore('animals');
      const request=store.getAll();request.onsuccess=()=>store.put({...request.result[0],notes:'New work from an old tab'});
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    });
    const before=await repo.snapshot();
    await assert.rejects(removeMovedRecords(repo,{confirmed:true}),/fresh copy/);
    assert.deepEqual(await repo.snapshot(),before);
  }finally{repo.close();}
});
test('an old user who only accepted terms has no herd to carry',async()=>{
  const {acknowledge}=await import('../app/lib/terms.js');
  const repo=await openRepository({factory:new IDBFactory()});try {
    await acknowledge(repo,true);
    const s=await repo.snapshot();assert.ok(s.revisions.length);
    assert.equal(shouldRedirect(s,{moved:true}),true);
    assert.ok(s.metadata[0].termsAcknowledgments.length);
  }finally{repo.close();}
});
