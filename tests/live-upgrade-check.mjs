// Use a throwaway persistent browser profile. Never point this at a farmer's profile.
// node tests/live-upgrade-check.mjs seed|check BASE_URL PROFILE_DIR OUT_DIR [DB_VERSION] [APP_VERSION] [--fixture]
import {chromium} from 'playwright';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import assert from 'node:assert/strict';
import {SEED_FIELDS, assertUpgrade} from './upgrade-gate.mjs';
const [mode, base, profile, output, dbArg = '1', appArg] = process.argv.slice(2);
let ctx;
try {
  assert.ok(['seed','check'].includes(mode) && base && profile && output,
    'Usage: seed|check BASE_URL PROFILE_DIR OUT_DIR [DB_VERSION] [APP_VERSION] [--fixture]');
  const url = new URL(base).href;
  assert.ok(url.endsWith('/'), 'Base URL must end with /');
  const dbVersion = Number(dbArg);
  assert.ok(Number.isInteger(dbVersion) && dbVersion > 0, 'Expected DB version must be a positive integer');
  const expectedApp = appArg && !appArg.startsWith('--') ? appArg
    : JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
  await mkdir(output, {recursive:true});
  const receiptPath = join(output, 'upgrade-seed.json');
  const expected = mode === 'check' ? JSON.parse(await readFile(receiptPath, 'utf8')) : null;
  if (expected) assert.equal(expected.url, url, 'Use the same origin and path as the seed');
  ctx = await chromium.launchPersistentContext(resolve(profile), {viewport:{width:390,height:844}, serviceWorkers:'allow'});
  const page = ctx.pages()[0] || await ctx.newPage(), errors = [];
  ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, {waitUntil:'networkidle'});
  await page.waitForFunction(() => document.querySelector('.badge') && !/Opening/.test(document.querySelector('#status')?.textContent || ''));
  const read = () => page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some(d => d.name === 'manley_herd_records')) throw Error('Herd database is missing');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('manley_herd_records');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db=request.result, stores={}, names=[...db.objectStoreNames].filter(n => n !== 'metadata');
        const tx=db.transaction(names);
        for(const name of names) {const get=tx.objectStore(name).getAll();get.onsuccess=()=>{stores[name]=get.result;};}
        tx.onabort=()=>{db.close();reject(tx.error);};
        tx.oncomplete=()=>{const dbVersion=db.version;db.close();resolve({dbVersion, stores, record:stores.animals.find(a => a.farmId === 'UPG777')});};
      };
    });
  });
  if (mode === 'seed') {
    const fixture = process.argv.includes('--fixture')
      ? JSON.parse(await readFile(new URL('./fixtures/sample-herd.json', import.meta.url), 'utf8')) : null;
    await page.evaluate(async ({url, fields, fixture}) => {
      const {openRepository} = await import(new URL('lib/database.js',url));
      const {acknowledge} = await import(new URL('lib/terms.js',url));
      const {commitWorkflow} = await import(new URL('lib/workflows.js',url));
      const repo=await openRepository();
      try {
        if ((await repo.snapshot()).animals.length) throw Error('Seed needs an empty throwaway profile');
        if(fixture) {
          const {previewRestore, commitRestore, exportBackup}=await import(new URL('lib/backup.js',url));
          const safetyBackup=await exportBackup(repo), plan=await previewRestore(repo,fixture);
          await commitRestore(repo,plan,{safetyBackup,downloadConfirmed:true,acknowledgeWarnings:true});
        }
        await acknowledge(repo,true);
        await commitWorkflow(repo,await repo.snapshot(),'animal',fields);
      } finally {repo.close();}
    }, {url, fields:SEED_FIELDS, fixture});
    // A first visit installs the worker but does not control this page until a reload after activation.
    await page.evaluate(() => navigator.serviceWorker.ready);
    for (let attempt = 0; attempt < 3 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)); attempt++) {
      await page.reload({waitUntil:'networkidle'});
    }
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout:30000});
    const state=await read();
    assertUpgrade(state,state,errors,dbVersion);
    const appVersion=(await page.locator('.badge').textContent()).match(/\d+\.\d+\.\d+-beta\.\d+/)?.[0];
    assert.ok(appVersion, 'Seed app version missing');
    await writeFile(receiptPath,JSON.stringify({...state,url,appVersion},null,2)+'\n');
    console.log('SEED READY', appVersion, receiptPath);
  } else {
    assert.notEqual(expected.appVersion, expectedApp, 'Seed before the upgrade, on the old release');
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();if(!registration)throw Error('Service worker missing');await registration.update();});
    const current = await page.locator('.badge').textContent();
    if (!current.includes(expectedApp)) {
      await page.locator('#pwa-update').waitFor({state:'visible',timeout:30000});
      await page.locator('#pwa-update').click();
      await page.waitForFunction(version=>document.querySelector('.badge')?.textContent.includes(version),expectedApp,{timeout:30000});
    }
    await page.reload({waitUntil:'networkidle'});
    assert.ok((await page.locator('.badge').textContent()).includes(expectedApp), 'Wrong app version after update');
    assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true,'No active service worker');
    assertUpgrade(expected,await read(),errors,dbVersion);
    await page.screenshot({path:join(output,'live-upgrade-after.png')});
    await writeFile(join(output,'upgrade-pass.json'),JSON.stringify({url,appVersion:expectedApp,dbVersion,errors,checkedAt:new Date().toISOString()},null,2)+'\n');
    console.log('UPGRADE GATE PASSED');
  }
} catch(e) {console.error('UPGRADE GATE FAILED:',e.stack || e.message);process.exitCode=1;}
finally {await ctx?.close();}
