// Maintainer browser checks. Synthetic fixture only. No app writes from form completion.
// node tests/ui-rules.mjs BASE_URL OUT_DIR [--moved]
// --moved seeds a synthetic prior-release profile, then checks real read-only flows.
import {chromium} from 'playwright';
import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {extname, join as joinPath} from 'node:path';
// Optional: HERD_SERVE_DIR=dist/herd-origin answers BASE_URL from local files (pre-deploy checks; service workers blocked).
const serveDir=process.env.HERD_SERVE_DIR;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain'};
const [base,out,mode]=process.argv.slice(2);
const moved=mode==='--moved';
if(!base || !out) throw Error('Usage: BASE_URL OUT_DIR');
const url=new URL(base).href, fixture=JSON.parse(await readFile(new URL('./fixtures/sample-herd.json',import.meta.url),'utf8'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const [width,height] of [[390,844],[320,568]]) for(const theme of ['sunlight','dark']) for(const textSize of [17,22]) {
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:(moved||serveDir)?'block':'allow'}), errors=[];
    if(serveDir) await context.route(u=>u.href.startsWith(url),route=>{let p=new URL(route.request().url()).pathname.slice(new URL(url).pathname.length);if(!p||p.endsWith('/'))p+='index.html';const f=joinPath(serveDir,p);if(!existsSync(f))return route.fulfill({status:404,body:''});return route.fulfill({status:200,contentType:mime[extname(f)]||'application/octet-stream',body:readFileSync(f)});});
    try {
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      if(moved) await page.route('**/lib/deploy-config.js',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:(await response.text()).replace('"moved":true','"moved":false')});
      });
      await page.goto(url,{waitUntil:'networkidle'});
      const animalId=await page.evaluate(async({url,fixture,theme,textSize})=>{
        const {writeDevice}=await import(new URL('lib/device-safety.js',url));writeDevice(localStorage,{textSize});
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
      },{url,fixture,theme,textSize});
      if(moved) await page.unrouteAll({behavior:'wait'});
      await page.reload({waitUntil:'networkidle'});
      await page.locator('#herd h1').waitFor();
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:join(out,`home-${width}-${theme}-${textSize}.png`),fullPage:true});
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
          await page.screenshot({path:join(out,`moved-${flow}-${width}-${theme}-${textSize}.png`)});
        }
        const after=await page.evaluate(async url=>{
          const {openRepository}=await import(new URL('lib/database.js',url));
          const repo=await openRepository();try{return await repo.snapshot();}finally{repo.close();}
        },url);
        assert.deepEqual(after,before,'moved flow checks never change records');
        assert.deepEqual(errors,[]);
        continue;
      }
      const logo=page.locator('.brand img');
      assert.ok(await logo.evaluate(img=>img.complete&&img.naturalWidth>0),'bundled logo loads');
      assert.ok(await logo.isVisible(),'site logo renders');
      assert.equal(await logo.evaluate(img=>new URL(img.src).pathname),new URL('images/logo.png',url).pathname,'logo stays inside app base');
      assert.ok(await page.locator('#pwa-panel').evaluate(panel=>panel.getBoundingClientRect().top>=document.querySelector('#main').getBoundingClientRect().bottom),'offline status follows work');
      assert.equal(await page.locator('#update-status').evaluate(n=>n.closest('details').open),false,'failure details start closed');
      const nav=page.locator('.app-tabs');
      assert.equal(await nav.locator('a').count(),4);
      const bar=await nav.boundingBox();assert.equal(bar.height,56);assert.ok(Math.abs(bar.y+bar.height-height)<2);
      assert.ok(bar.height/height<=0.25);
      assert.equal(await page.locator('.site-header').evaluate(n=>getComputedStyle(n).position),'static');
      for(const a of await nav.locator('a').all()){const box=await a.boundingBox();assert.ok(box.width>=48&&box.height>=48);assert.ok(box.x>=0&&box.x+box.width<=width);}
      assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize)),textSize);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      for(const target of await page.locator('.home-work input[type="search"], .home-work .quick-actions>.quick-action').all()){
        const box=await target.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=bar.y,'launch work below the fold');
      }
      await nav.getByRole('link',{name:'Add',exact:true}).click();await page.getByRole('heading',{name:'Add a record',exact:true}).waitFor();
      await nav.getByRole('link',{name:'Home',exact:true}).click();await page.getByRole('heading',{name:'Your herd',exact:true}).waitFor();
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
        await page.locator('#herd .backup-light').screenshot({path:join(out,`light-${state}-${width}-${theme}-${textSize}.png`)});
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
          const controls=form.locator('.fields label:not([hidden]) input:visible, .fields label:not([hidden]) select:visible, .fields label:not([hidden]) textarea:visible');
          for(const input of await controls.all()) {
            await input.evaluate(control=>{
              if(control.type==='checkbox') control.checked=true;
              else if(control.tagName==='SELECT' && !control.value) control.value=[...control.options].find(o=>o.value)?.value||'';
              else if(!control.value) control.value=control.type==='number'?'1':control.type==='date'?'2026-10-13':control.type==='time'?'12:00':control.type==='datetime-local'?'2026-10-13T12:00':'Browser test';
              control.dispatchEvent(new Event('input',{bubbles:true}));
            });
          }
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),flow+' overflow');
          assert.ok(await controls.count(),flow+' has questions');
          for(const control of await controls.all()){
            // Grouped screens scroll within the question pane. Check each field at its reading position.
            await control.evaluate(c=>c.closest('label').scrollIntoView({block:'start'}));
            const geometry=await control.evaluate(c=>{
              const r=c.getBoundingClientRect(), label=c.closest('label').getBoundingClientRect();
              const form=c.closest('form'),bar=form.querySelector('.sticky').getBoundingClientRect(),pane=form.querySelector('.fields').getBoundingClientRect();
              const nav=document.querySelector('.app-tabs').getBoundingClientRect();
              return {top:r.top,bottom:r.bottom,width:r.width,height:r.height,labelTop:label.top,barTop:bar.top,paneTop:pane.top,navTop:nav.top};
            });
            assert.ok(geometry.top>=geometry.paneTop-1&&geometry.bottom<=geometry.barTop+1,`${flow} ${step}: control outside pane`);
            assert.ok(geometry.bottom<=geometry.navTop,`${flow}: nav covers control`);
            assert.ok(geometry.width>=48&&geometry.height>=48,`${flow}: target below 48px`);
          }
          await page.screenshot({path:join(out,`${flow}-${step}-${width}-${theme}-${textSize}.png`)});
          const before=review;await form.getByRole('button',{name:'Next',exact:true}).click();
          assert.notEqual(await form.locator('.guide-progress').textContent(),before,`${flow}: cannot advance step ${step}`);
          if(step===79) assert.fail(`${flow}: step count exceeded`);
        }
        assert.ok(reachedReview,flow+': review was reached');
        const total=Number((await form.locator('.guide-progress').textContent()).match(/of (\d+)/)[1]);
        if(flow==='treatment')assert.ok(total<=9,'treatment screen budget');
        if(['weight','move','calving'].includes(flow))assert.ok(total<=5,flow+' screen budget');
        if(flow==='treatment')assert.match(await form.locator('.guide-review').textContent(),/Recorded interval elapsed never means safe/);
      }
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }
  console.log('UI RULES PASSED. Inspect every screenshot and run device checks before release.');
}finally{await browser.close();}
