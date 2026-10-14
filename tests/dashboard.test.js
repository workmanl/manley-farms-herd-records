// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";
import { openRepository } from "../app/lib/database.js";
import { commitWorkflow, draftStore } from "../app/lib/workflows.js";
import { HerdUI } from "../app/lib/herd-ui.js";
async function setup() {
  const dom = new JSDOM('<main id="herd"></main>', {
    url: "https://herd.test/#animals/new",
  });
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.localStorage = dom.window.localStorage;
  const repo = await openRepository({ factory: new IDBFactory() });
  let notices = [],
    failRefresh = false;
  const root = document.getElementById("herd");
  const ui = new HerdUI(root, {
    repository: () => repo,
    message: (...m) => notices.push(m),
    refresh: async () => {
      if (failRefresh) throw new Error("View unavailable");
      ui.render(await repo.snapshot(), location.hash.slice(1));
    },
  });
  const render = async (route) => {
    location.hash = "#" + route;
    ui.render(await repo.snapshot(), route);
  };
  const field = (name, value) => {
    const e = root.querySelector(`[name="${name}"]`);
    assert.ok(e, `field ${name}`);
    if (value !== undefined) {
      if (e.type === "checkbox") e.checked = value;
      else e.value = value;
    }
    return e;
  };
  const submit = async (next = false) => {
    const form = root.querySelector("form");
    return form.onsubmit({
      preventDefault() {},
      submitter: form.querySelector(
        next ? 'button[value="next"]' : 'button[type="submit"]',
      ),
    });
  };
  const save = async (action, input) =>
    commitWorkflow(repo, await repo.snapshot(), action, input);
  const cleanup = () => {
    repo.close();
    dom.window.close();
  };
  return {
    dom,
    repo,
    ui,
    root,
    render,
    field,
    submit,
    save,
    notices,
    cleanup,
    failRefresh: () => {
      failRefresh = true;
    },
  };
}

import { dashboardModel } from "../app/lib/dashboard.js";
import { evaluateWithdrawal } from "../app/lib/withdrawal.js";
import { openDemo, deleteDemo } from "../app/lib/demo.js";
function healthFields(h) {
  for (const [key, value] of Object.entries({
    administrationDate: "2026-10-01",
    enteredLocalTime: "2026-10-01T10:00:00",
    timeZone: "Etc/UTC",
    offsetMinutes: "0",
    product: "Demo vaccine",
    doseValue: "2",
    doseUnit: "mL",
    route: "SC",
    injectionSite: "Neck",
    lot: "LOT-001",
    expiryDate: "2027-01-01",
    reason: "Demo vaccination",
    administrator: "Demo operator",
    instructionReference: "Demo label",
    "meat:state": "duration",
    "meat:value": "48",
    "meat:unit": "hours",
    "meat:source": "label",
    "meat:instructionReference": "Demo label",
    "milk:state": "not-applicable",
    "milk:source": "label",
    "milk:instructionReference": "Demo label",
    "milk:instructionText": "No marketed milk",
  }))
    h.field(key, value);
  h.root.querySelector("form").refreshTime?.();
}
test('empty dashboard has three steps, seven quick actions and bounded animal search',async()=>{
 const h=await setup();h.ui.demo=()=>{};await h.render('dashboard');
 assert.match(h.root.textContent,/Your first three steps/);assert.match(h.root.textContent,/Try it with sample cattle/);
 assert.equal(h.root.querySelectorAll('.quick-action').length,7);assert.equal(h.root.querySelectorAll('.snapshot-tile').length,6);
 assert.equal(h.root.querySelector('[name=query]').placeholder,'Type a tag or name');h.cleanup();
});
test('dashboard counts and Today use evaluator including departed and unknown holds',async()=>{
 const h=await setup();const a=await h.save('animal',{farmId:'214',sex:'female',birthDate:'2026-01-01',birthDatePrecision:'exact'});
 await h.render(`animals/${a.id}/treatment`);healthFields(h);h.field('administrationPrecision','date-only');await h.submit();
 const s=await h.repo.snapshot(),m=dashboardModel(s,'2026-10-13','2026-10-13T12:00:00.000Z'),e=evaluateWithdrawal(s,{now:'2026-10-13T12:00:00.000Z'});
 assert.deepEqual(m.evaluation.counts,e.counts);assert.equal(m.calves,1);assert.equal(m.active,1);
 assert.ok(m.attention.some(i=>/needs? a check/.test(i.text)));assert.ok(!m.attention.some(i=>/backup|copy/.test(i.text)));assert.ok(m.attention.some(i=>/meat hold/.test(i.text)));
 await h.render('dashboard');h.root.querySelectorAll('.snapshot-tile')[4].click();assert.equal(h.ui.filters.withdrawal,'needs-review');assert.equal(h.ui.filters.includeInactive,true);h.cleanup();
});
test('demo records have separate dataset IDs, writes cannot reach real herd, delete recreates only demo',async()=>{
 const factory=new IDBFactory(),real=await openRepository({factory});await commitWorkflow(real,await real.snapshot(),'animal',{farmId:'Real 1'});
 let demo=await openDemo(factory);assert.notEqual((await demo.snapshot()).metadata[0].datasetId,(await real.snapshot()).metadata[0].datasetId);
 await commitWorkflow(demo,await demo.snapshot(),'animal',{farmId:'Practice 4'});assert.equal((await real.snapshot()).animals.length,1);assert.equal((await demo.snapshot()).animals.length,19);
 demo.close();await deleteDemo(factory);demo=await openDemo(factory);assert.equal((await demo.snapshot()).animals.length,18);assert.equal((await real.snapshot()).animals[0].farmId,'Real 1');real.close();demo.close();
});
for(const action of ['animal','calving','treatment','weight','move','breeding','pregnancy','movement'])test(`guided ${action} saves through the existing transaction path`,async()=>{
 const h=await setup();const a=await h.save('animal',{farmId:'Mother',sex:'female'});const g=await h.save('group',{name:'South',type:'pasture'});await h.render(`dashboard/quick/${action}/${a.id}`);
 const form=h.root.querySelector('form');assert.ok(form.classList.contains('guided-form'));assert.ok(form.querySelectorAll('label:not([hidden])').length>=1);
 if(action==='animal')h.field('farmId','New animal');
 if(action==='calving')h.field('dateConfirmed',true);
 if(action==='treatment')healthFields(h);
 if(action==='weight')h.field('value','450');
 if(action==='move'){h.field('groupId',g.id);h.field('pasture','South');h.field('revisionReason','Summer grass');}
 if(action==='breeding')h.field('sireReference','External bull');
 if(action==='movement'){h.field('destination','Buyer');h.field('acknowledgeDeparture',true);}
 let mutations=0;const mutate=h.repo.mutate.bind(h.repo);h.repo.mutate=(...args)=>{mutations++;return mutate(...args);};
 const next=[...form.querySelectorAll('button')].find(b=>b.textContent==='Next');
 let questions=0;while(!next.hidden&&questions++<100)next.click();assert.ok(next.hidden,'all questions completed');
 await form.onsubmit({preventDefault(){},submitter:form.querySelector('button[type=submit]')});
 const s=await h.repo.snapshot();assert.equal(mutations,action==='weight'?0:1);assert.match(h.notices.at(-1)[0],/^Saved/);
 const stores={animal:'animals',calving:'calvings',treatment:'treatments',weight:'weights',move:'memberships',breeding:'breedings',pregnancy:'pregnancyChecks',movement:'movements'};
 assert.equal(s[stores[action]].length,action==='animal'?2:1);h.cleanup();
});
test('guided required question stops Next and Back retains answers',async()=>{
 const h=await setup();await h.render('dashboard/quick/animal');const next=[...h.root.querySelectorAll('button')].find(b=>b.textContent==='Next');next.click();assert.match(h.root.querySelector('.guide-progress').textContent,/^Step 1 of /);
 h.field('farmId','001');next.click();[...h.root.querySelectorAll('button')].find(b=>b.textContent==='Back').click();assert.equal(h.field('farmId').value,'001');h.cleanup();
});

import { recentActivity } from '../app/lib/dashboard.js';
import { adg, events } from '../app/lib/workflows.js';
import { readFile } from 'node:fs/promises';
test('sample herd tells a linked story with current holds and Today tasks',async()=>{
 const factory=new IDBFactory();const repo=await openDemo(factory);const s=await repo.snapshot();
 assert.equal(s.animals.length,18);assert.equal(s.groups.length,3);assert.equal(s.calvings.length,4);
 const year=new Date().getUTCFullYear().toString();assert.equal(s.animals.filter(a=>a.birthDate?.startsWith(year)).length,4);
 for(const c of s.calvings)assert.equal(s.animals.find(a=>a.id===c.calves[0].calfId).damId,c.damId);
 assert.equal(s.animals.filter(a=>a.status==='sold').length,1);assert.equal(s.breedings.length,1);assert.equal(s.pregnancyChecks.length,1);
 for(const id of new Set(s.weights.filter(w=>w.type!=='birth').map(w=>w.animalId))){const weights=s.weights.filter(w=>w.animalId===id);assert.ok(adg(...weights).value>0);}
 const model=dashboardModel(s,new Date().toISOString().slice(0,10));
 assert.equal(model.evaluation.animals.filter(r=>r.meat.releaseAt&&r.meat.status==='held').length,1);
 assert.equal(model.evaluation.animals.filter(r=>r.milk.releaseAt&&r.milk.status==='held').length,1);
 assert.equal(model.evaluation.counts.review,1);
 assert.ok(model.attention.some(i=>/Buttercup 216.*milk hold/.test(i.text)));
 assert.ok(model.attention.some(i=>/Steer 330.*meat hold/.test(i.text)));
 assert.ok(model.attention.some(i=>/needs? a check/.test(i.text)));
 repo.close();
});
test('home activity uses plain herd sentences while Events retains technical records',async()=>{
 const repo=await openDemo(new IDBFactory());const s=await repo.snapshot();const activity=recentActivity(s,undefined,100);
 for(const pattern of [/Daisy 214 had a calf/,/Weighed Rosie 215: 1,140 lb/,/Treated Steer 330 \(meat hold until/,/Moved 6 cattle to North pasture/,/Sold Heifer 412/])assert.ok(activity.some(e=>pattern.test(e.text)),String(pattern));
 assert.ok(activity.every(e=>e.relative&&e.icon));assert.ok(activity.every(e=>!['animals','identifiers','revisions','groups'].includes(e.store)));
 assert.ok(events(s).some(e=>e.store==='identifiers'));assert.equal(recentActivity(s).length,5);
 const h=await setup();h.ui.demoMode=true;h.ui.demo=()=>{};h.ui.render(s,'dashboard');assert.equal(h.root.querySelectorAll('aside').length,0);assert.match(h.root.textContent,/Correct \/ void treatment/);assert.doesNotMatch(h.root.textContent,/First-run terms|Animal identity|Identifier farm-id/);h.cleanup();repo.close();
});
test('every animal picker and selected quick action has matching numbered progress',async()=>{
 const h=await setup();const a=await h.save('animal',{farmId:'Daisy 214',sex:'female'});
 for(const action of ['calving','treatment','weight','move','breeding','pregnancy','movement']){
 await h.render(`dashboard/quick/${action}`);const count=h.root.querySelector('.progress-dots').children.length;assert.equal(h.root.querySelector('.guide-progress').textContent,`Step 1 of ${count}`);assert.ok(h.root.querySelector('.progress-dots .current'));
 await h.render(`dashboard/quick/${action}/${a.id}`);assert.equal(h.root.querySelector('.progress-dots').children.length,count);assert.equal(h.root.querySelector('.guide-progress').textContent,`Step 2 of ${count}`);
 }h.cleanup();
});
test('demo banner and button groups use one block with secondary danger and explicit gaps',async()=>{
 const app=await readFile(new URL('../app/app.js',import.meta.url),'utf8');const css=await readFile(new URL('../app/styles.css',import.meta.url),'utf8');const dashboard=await readFile(new URL('../app/lib/dashboard.js',import.meta.url),'utf8');
 assert.equal((app.match(/Return to my real herd/g)||[]).length,1);assert.doesNotMatch(dashboard,/Return to my real herd/);assert.match(app,/remove.className = "secondary danger"/);assert.match(app,/actions.append\(leave, remove\)/);assert.match(css,/\.actions\s*\{[^}]*gap: 8px/s);assert.match(css,/#demo-banner \.actions[^}]*gap:12px/);assert.match(css,/\.secondary\.danger[^}]*background:transparent/);
});
test('old three-animal demo upgrades through save paths without replacing animal IDs',async()=>{
 const factory=new IDBFactory();const old=await openRepository({factory,name:'manley_herd_records_demo'});const ids=[];
 for(const [farmId,sex]of [['Demo 214','female'],['Demo 215','female'],['Demo 301','steer']])ids.push((await commitWorkflow(old,await old.snapshot(),'animal',{farmId,sex})).id);
 old.close();let demo=await openDemo(factory);const s=await demo.snapshot();assert.equal(s.animals.length,18);for(const id of ids)assert.ok(s.animals.some(a=>a.id===id));demo.close();
 demo=await openDemo(factory);assert.equal((await demo.snapshot()).animals.length,18);demo.close();
});
test('demo hold dates stay relative to seeding time and elapsed intervals do not clear missing timing',async()=>{
 const now=new Date();const repo=await openDemo(new IDBFactory(),now);const s=await repo.snapshot();
 const e=evaluateWithdrawal(s,{now:now.toISOString()});const meat=e.animals.find(r=>r.animal.farmId==='Steer 330').meat;
 assert.ok(Date.parse(meat.releaseAt)>now.getTime()+6*86400000);assert.ok(Date.parse(meat.releaseAt)<now.getTime()+8*86400000);
 const later=evaluateWithdrawal(s,{now:new Date(now.getTime()+10*86400000).toISOString()});assert.equal(later.animals.find(r=>r.animal.farmId==='Steer 330').meat.status,'elapsed');assert.ok(later.animals.find(r=>r.animal.farmId==='Steer 332').needsReview);repo.close();
});
test('quick action copy uses plain words and retains the hold safety notice',async()=>{
 const h=await setup();const a=await h.save('animal',{farmId:'Daisy',sex:'female'});await h.render(`dashboard/quick/treatment/${a.id}`);
 assert.match(h.root.textContent,/What day was it\?/);assert.match(h.root.textContent,/Who gave it\?/);assert.match(h.root.textContent,/How did you give it\?/);assert.match(h.root.textContent,/How long is the wait\?/);
 await h.render('dashboard');assert.match(h.root.textContent,/An elapsed interval never means safe/);assert.match(h.root.textContent,/Ask your veterinarian and check the label/);assert.doesNotMatch(h.root.textContent,/Breeding \/ preg check/);h.cleanup();
});
