// Throwaway profiles only. seed before deploy, check after the moved build is live.
// node tests/move-check.mjs seed|check OLD_URL NEW_URL OLD_PROFILE NEW_PROFILE OUT_DIR
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import assert from 'node:assert/strict';
const [mode, oldURL, newURL, oldProfile, newProfile, output] = process.argv.slice(2);
let context;
try {
  assert.ok(['seed','check'].includes(mode) && oldURL && newURL && oldProfile && newProfile && output,
    'Usage: seed|check OLD_URL NEW_URL OLD_PROFILE NEW_PROFILE OUT_DIR');
  assert.notEqual(new URL(oldURL).origin,new URL(newURL).origin,'Use separate origins');
  assert.notEqual(resolve(oldProfile),resolve(newProfile),'Use separate throwaway profiles');
  const gate = spawnSync(process.execPath,[new URL('./live-upgrade-check.mjs',import.meta.url).pathname,mode,oldURL,oldProfile,output,'1','1.3.0-beta.1'],{stdio:'inherit'});
  assert.equal(gate.status,0,'Old-site upgrade gate failed');
  if (mode === 'check') {
    await mkdir(output,{recursive:true});
    const expected = JSON.parse(await readFile(join(output,'upgrade-seed.json'),'utf8'));
    const errors=[];
    context=await chromium.launchPersistentContext(resolve(oldProfile),{serviceWorkers:'allow'});
    const old=await context.newPage(); old.on('pageerror',e=>errors.push(e.message));
    await old.goto(oldURL,{waitUntil:'networkidle'});
    await old.locator('#move-panel').waitFor({state:'visible'});
    assert.match(await old.locator('#move-copy').textContent(),/Your records are safe here/);
    const bytes=await old.evaluate(async base=>{
      const {openRepository}=await import(new URL('lib/database.js',base));
      const {prepareCopy,saveCopy}=await import(new URL('lib/save-copy.js',base));
      const {commitWorkflow}=await import(new URL('lib/workflows.js',base));
      const repo=await openRepository();
      try {
        if(!repo.moved) throw Error('Moved mode is missing');
        const before=await repo.snapshot();
        let blocked=false;
        try {await commitWorkflow(repo,before,'animal',{farmId:'SHOULD-NOT-SAVE',sex:'female'});} catch(e) {blocked=/read-only/.test(e.message);}
        if(!blocked)throw Error('New records are not blocked');
        if(JSON.stringify(before)!==JSON.stringify(await repo.snapshot()))throw Error('Old data changed');
        const copy=await prepareCopy(repo);let file;
        await saveCopy(repo,copy,{navigator:{},download:f=>{file=f;}});
        if(!file)throw Error('Save a copy produced no file');
        return file.text();
      } finally {repo.close();}
    },oldURL);
    await writeFile(join(output,'move-copy.json'),bytes);
    await context.close();context=null;
    context=await chromium.launchPersistentContext(resolve(newProfile),{serviceWorkers:'allow'});
    const fresh=await context.newPage();fresh.on('pageerror',e=>errors.push(e.message));
    await fresh.goto(newURL,{waitUntil:'networkidle'});
    const actual=await fresh.evaluate(async({base,bytes})=>{
      const {openRepository}=await import(new URL('lib/database.js',base));
      const {hasHerdRecords}=await import(new URL('lib/origin-move.js',base));
      const {verifyBackup,exportBackup,previewRestore,commitRestore}=await import(new URL('lib/backup.js',base));
      const repo=await openRepository();
      try {
        if(repo.moved || hasHerdRecords(await repo.snapshot()))throw Error('New profile must be empty and writable');
        await verifyBackup(bytes);
        const safetyBackup=await exportBackup(repo), plan=await previewRestore(repo,bytes);
        await commitRestore(repo,plan,{safetyBackup,downloadConfirmed:true,acknowledgeWarnings:true});
        const stores=await repo.snapshot();return {version:repo.db.version,record:stores.animals.find(a=>a.farmId==='UPG777'),stores};
      } finally {repo.close();}
    },{base:newURL,bytes});
    assert.equal(actual.version,1);
    assert.deepEqual(actual.record,expected.record,'Restored record differs in an exact field');
    // Restore intentionally resets local acceptance and copy receipts and audits those changes.
    for(const [name,rows] of Object.entries(expected.stores)) {
      if(name === 'revisions') {
        for(const row of rows) assert.deepEqual(actual.stores.revisions.find(r=>r.id===row.id),row,'Restored history differs');
        continue;
      }
      assert.deepEqual(actual.stores[name],rows,`Restored store differs: ${name}`);
    }
    assert.deepEqual(errors,[],'Page errors stop the move');
    await writeFile(join(output,'move-pass.json'),JSON.stringify({oldURL,newURL,record:actual.record,errors,checkedAt:new Date().toISOString()},null,2)+'\n');
    console.log('MOVE GATE PASSED',JSON.stringify(actual.record,null,2));
  }
} catch(e) {console.error('MOVE GATE FAILED',e.stack || e.message);process.exitCode=1;}
finally {await context?.close();}
