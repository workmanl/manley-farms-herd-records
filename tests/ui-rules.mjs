// Maintainer browser checks. Synthetic fixture only. No app writes from form completion.
// node tests/ui-rules.mjs BASE_URL OUT_DIR [--moved]
// --moved seeds a synthetic prior-release profile, then checks real read-only flows.
import {chromium} from 'playwright';
import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const [base,out,mode]=process.argv.slice(2);
const moved=mode==='--moved';
if(!base || !out) throw Error('Usage: BASE_URL OUT_DIR');
const url=new URL(base).href, fixture=JSON.parse(await readFile(new URL('./fixtures/sample-herd.json',import.meta.url),'utf8'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const [width,height] of [[390,844],[320,568]]) for(const theme of ['sunlight','dark']) {
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:moved?'block':'allow'}), errors=[];
    try {
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      if(moved) await page.route('**/lib/deploy-config.js',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:(await response.text()).replace('"moved":true','"moved":false')});
      });
      await page.goto(url,{waitUntil:'networkidle'});
      const animalId=await page.evaluate(async({url,fixture,theme})=>{
        const {openRepository}=await import(new URL('lib/database.js',url));
        const {exportBackup,previewRestore,commitRestore}=await import(new URL('lib/backup.js',url));
        const {acknowledge}=await import(new URL('lib/terms.js',url));
        const repo=await openRepository();
        try {
          await commitRestore(repo,await previewRestore(repo,fixture),{safetyBackup:await exportBackup(repo),downloadConfirmed:true});
          await acknowledge(repo,true);
          const op=(await repo.snapshot()).operation[0];
          await repo.mutate([{store:'operation',expectedRevision:op.revision,record:{...op,theme,revision:op.revision+1,updatedAt:new Date().toISOString()}}],{reason:'Browser test theme'});
          return fixture.stores.animals.find(a=>a.sex==='female'&&a.status==='active').id;
        }finally{repo.close();}
      },{url,fixture,theme});
      if(moved) await page.unrouteAll({behavior:'wait'});
      await page.reload({waitUntil:'networkidle'});
      await page.locator('#herd h1').waitFor();
      await page.screenshot({path:join(out,`home-${width}-${theme}.png`),fullPage:true});
      if(moved) {
        assert.equal(await page.locator('#move-panel').isVisible(),true);
        const before=await page.evaluate(async url=>{
          const {openRepository}=await import(new URL('lib/database.js',url));
          const repo=await openRepository();try{return await repo.snapshot();}finally{repo.close();}
        },url);
        for(const flow of ['animal','weight','move','calving','breeding','pregnancy','movement','treatment']) {
          await page.goto(url+`#dashboard/quick/${flow}${flow==='animal'?'':'/'+animalId}`,{waitUntil:'networkidle'});
          assert.equal(await page.locator('#herd .guided-form').count(),0,flow+' stays read-only');
          assert.match(await page.locator('#herd').textContent(),/read-only/);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),flow+' horizontal scroll');
          await page.screenshot({path:join(out,`moved-${flow}-${width}-${theme}.png`)});
        }
        const after=await page.evaluate(async url=>{
          const {openRepository}=await import(new URL('lib/database.js',url));
          const repo=await openRepository();try{return await repo.snapshot();}finally{repo.close();}
        },url);
        assert.deepEqual(after,before,'moved flow checks never change records');
        assert.deepEqual(errors,[]);
        continue;
      }
      // Show each backup state using real verified paths, then changed work.
      for(const state of ['red','green','yellow']) {
        if(state==='green') await page.evaluate(async url=>{
          const {openRepository}=await import(new URL('lib/database.js',url));
          const {exportBackup}=await import(new URL('lib/backup.js',url));
          const {checkCopy}=await import(new URL('lib/save-copy.js',url));
          const repo=await openRepository();try{await checkCopy(repo,await exportBackup(repo));}finally{repo.close();}
        },url);
        if(state==='yellow') await page.evaluate(async({url,id})=>{
          const {openRepository}=await import(new URL('lib/database.js',url));const repo=await openRepository();
          try{const a=(await repo.snapshot()).animals.find(a=>a.id===id);await repo.mutate([{store:'animals',expectedRevision:a.revision,record:{...a,notes:'New browser test work',revision:a.revision+1,updatedAt:new Date(Date.now()+1000).toISOString()}}],{reason:'Browser test new work'});}finally{repo.close();}
        },{url,id:animalId});
        await page.reload({waitUntil:'networkidle'});
        await page.locator(`#herd .backup-light[data-health="${state}"]`).waitFor();
        await page.locator('#herd .backup-light').screenshot({path:join(out,`light-${state}-${width}-${theme}.png`)});
      }
      const homeCopy=page.locator('#herd .backup-light');
      assert.equal(await homeCopy.count(),1,'Home has one backup card');
      assert.equal(await homeCopy.getByRole('button',{name:'Save a copy',exact:true}).count(),1);
      assert.equal(await page.locator('#backup-reminder').count(),0);
      assert.equal(await homeCopy.getByRole('button',{name:/Use dark theme|Use Sunlight/}).count(),0);
      for(const flow of ['animal','weight','move','calving','breeding','pregnancy','movement','treatment']) {
        await page.goto(url+`#dashboard/quick/${flow}${flow==='animal'?'':'/'+animalId}`,{waitUntil:'networkidle'});
        const form=page.locator(`#herd .guided-form[data-guide-action="${flow}"]`);await form.waitFor();
        let reachedReview=false;
        for(let step=0;step<80;step++) {
          const review=await form.locator('.guide-progress').textContent();
          if(review.includes('Check your answers')) {reachedReview=true;break;}
          if(flow==='calving') {
            for(const name of ['Add twin to this delivery','Discard draft and start again']) {
              const button=form.getByRole('button',{name,exact:true});
              assert.ok(await button.evaluate(b=>b.classList.contains('secondary')),name+' must be secondary');
              const box=await button.boundingBox();assert.ok(box.height>=48 && box.width>=48,name+' target under 48px');
            }
          }
          const controls=form.locator('.fields label:not([hidden]) input, .fields label:not([hidden]) select, .fields label:not([hidden]) textarea');
          for(const input of await controls.all()) {
            await input.evaluate(control=>{
              if(control.type==='checkbox') control.checked=true;
              else if(control.tagName==='SELECT' && !control.value) control.value=[...control.options].find(o=>o.value)?.value||'';
              else if(!control.value) control.value=control.type==='number'?'1':control.type==='date'?'2026-10-13':control.type==='time'?'12:00':control.type==='datetime-local'?'2026-10-13T12:00':'Browser test';
              control.dispatchEvent(new Event('input',{bubbles:true}));
            });
          }
          const geometry=await form.evaluate(form=>{
            const visible=[...form.querySelectorAll('.fields label:not([hidden])')].filter(l=>l.getClientRects().length);
            const rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
            const bar=rect(form.querySelector('.sticky').getBoundingClientRect());
            const questions=visible.map(l=>({label:rect(l.getBoundingClientRect()),control:rect(l.querySelector('input,select,textarea').getBoundingClientRect())}));
            return {bar,questions,width:document.documentElement.scrollWidth,viewport:innerWidth};
          });
          assert.ok(geometry.width<=geometry.viewport,`${flow} step ${step}: horizontal scroll`);
          assert.ok(geometry.questions.length,`${flow}: no question`);
          for(const {label,control} of geometry.questions) {
            for(const r of [label,control]) assert.ok(r.bottom<=geometry.bar.top || r.top>=geometry.bar.bottom,`${flow} step ${step}: action bar covers question`);
            assert.ok(control.height>=48 && control.width>=48,`${flow} step ${step}: target under 48px`);
          }
          await page.screenshot({path:join(out,`${flow}-${step}-${width}-${theme}.png`)});
          const before=review;await form.getByRole('button',{name:'Next',exact:true}).click();
          assert.notEqual(await form.locator('.guide-progress').textContent(),before,`${flow}: cannot advance step ${step}`);
          if(step===79) assert.fail(`${flow}: step count exceeded`);
        }
        assert.ok(reachedReview,flow+': review was reached');
      }
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
  console.log('UI RULES PASSED. Inspect every screenshot and run device checks before release.');
}finally{await browser.close();}
