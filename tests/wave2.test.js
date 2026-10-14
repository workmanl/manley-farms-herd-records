// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {openRepository} from '../app/lib/database.js';
import {HerdUI} from '../app/lib/herd-ui.js';
import {prepareWorkflow,commitWorkflow} from '../app/lib/workflows.js';
import {timeChoices,humanWhen} from '../app/lib/when.js';
import {enteredInstant} from '../app/lib/withdrawal.js';
import {reusable,REUSE_FIELDS,rememberTreatment,treatmentTools} from '../app/lib/last-used.js';
import {plainOption,plainLabel,entryError} from '../app/lib/copy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function setup(){
 const dom=new JSDOM('<main id="herd"></main>',{url:'https://herd.test/'});
 Object.assign(globalThis,{document:dom.window.document,location:dom.window.location,localStorage:dom.window.localStorage});
 const repo=await openRepository({factory:new IDBFactory()});
 const animal=await commitWorkflow(repo,await repo.snapshot(),'animal',{farmId:'Rosie 215',visualTag:'215',sex:'female'});
 const root=document.querySelector('main');const messages=[];
 const ui=new HerdUI(root,{repository:()=>repo,refresh:async()=>{},message:m=>messages.push(m)});
 const render=async route=>ui.render(await repo.snapshot(),route);
 const close=()=>{repo.close();dom.window.close();};
 return {dom,repo,animal,root,ui,render,close,messages};
}
const data={administrationPrecision:'instant',administrationDate:'2026-10-01',enteredLocalTime:'2026-10-01T10:00:00',timeZone:'Etc/UTC',offsetMinutes:'0',product:'LA-200',doseValue:'5',doseUnit:'mL',route:'SC',injectionSite:'Neck',reason:'Vet plan',administrator:'Scott',instructionReference:'Bottle label',notes:'Test record', 'meat:state':'duration','meat:value':'28','meat:unit':'days','meat:source':'label','meat:instructionReference':'Bottle label','milk:state':'unknown'};
function fill(form,input){for(const [k,v]of Object.entries(input)){const c=form.elements.namedItem(k);if(c){if(c.type==='checkbox')c.checked=v;else c.value=v;}}form.refreshTime?.();}
function collect(form){return Object.fromEntries([...form.elements].filter(c=>c.name&&!c.disabled).map(c=>[c.name,c.type==='checkbox'?c.checked:c.value.replace?.(/\.\d+$/,'') ?? c.value]));}
test('farm clock finds normal, repeated, missing and quarter-hour times without guessing',()=>{
 assert.equal(timeChoices('2026-10-01T10:00','America/Los_Angeles').length,1);
 const overlap=timeChoices('2026-11-01T01:30','America/Los_Angeles');assert.deepEqual(overlap.map(c=>c.offset),[-420,-480]);
 for(const c of overlap)assert.equal(enteredInstant('2026-11-01T01:30:00','America/Los_Angeles',c.offset),c.instant);
 assert.deepEqual(timeChoices('2026-03-08T02:30','America/Los_Angeles'),[]);
 assert.equal(timeChoices('2026-10-01T10:00','Asia/Kathmandu')[0].offset,345);
 assert.equal(timeChoices('2026-10-01T10:00:00.000','Etc/UTC')[0].offset,0);
 assert.deepEqual(timeChoices('bad','Etc/UTC'),[]);
 assert.match(humanWhen('2026-10-01','America/Los_Angeles'),/Oct 1/);
 assert.match(humanWhen('2026-10-17T12:00:00Z','Etc/UTC',Date.parse('2026-10-13T12:00:00Z')),/in 4 days/);
 assert.doesNotMatch(humanWhen('2026-10-17T12:00:00Z','America/Los_Angeles'),/America\//);
});
test('reuse allowlist excludes dose amount, animal, dates and every withdrawal answer',()=>{
 assert.deepEqual(Object.keys(reusable(data)),REUSE_FIELDS);
 assert.ok(REUSE_FIELDS.every(k=>!k.includes(':')&&!/date|time|doseValue|animal/i.test(k)));
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.doesNotThrow(()=>rememberTreatment(blocked,'farm',data));
});
test('reuse requires a tap and withdrawal suggestions show product, value and unit',async()=>{
 const h=await setup();try{
  rememberTreatment(localStorage,'farm',data);
  await h.render(`animals/${h.animal.id}/treatment`);const form=h.root.querySelector('form');treatmentTools(form,'farm',localStorage);
  assert.equal(form.elements.product.value,'');assert.equal(form.elements['meat:value'].value,'');
  const buttons=[...form.querySelectorAll('button')];buttons.find(b=>b.textContent.startsWith('Same as last time')).click();
  assert.equal(form.elements.product.value,'LA-200');assert.equal(form.elements.route.value,'SC');assert.equal(form.elements['meat:value'].value,'');
  const meat=buttons.find(b=>b.textContent.startsWith('Use last meat'));assert.match(meat.textContent,/LA-200.*28.*Days/);meat.click();assert.equal(form.elements['meat:value'].value,'28');
  form.elements.product.value='Other product';form.elements['meat:value'].value='';meat.click();assert.equal(form.elements['meat:value'].value,'');
 }finally{h.close();}
});
test('grouped treatment is eight screens and preserves full-form records for every rule and timing path',async()=>{
 const h=await setup();try{
  for(const state of ['duration','unknown','not-applicable','prohibited','manual-review'])for(const precision of ['instant','date-only']){
   const input={...data,administrationPrecision:precision,'meat:state':state,'milk:state':state,'meat:instructionText':'Label and vet check','milk:instructionText':'No marketed milk'};
   await h.render(`animals/${h.animal.id}/treatment`);const old=h.root.querySelector('form');fill(old,input);const oldData=collect(old);
   await h.render(`dashboard/quick/treatment/${h.animal.id}`);const form=h.root.querySelector('form');fill(form,input);
   assert.equal(form.querySelectorAll('.progress-dots span').length,8);
   const next=[...form.querySelectorAll('button')].find(b=>b.textContent==='Next');let steps=0;while(!next.hidden&&steps++<10)next.click();assert.ok(next.hidden,state+' '+precision);
   assert.match(form.querySelector('.guide-review').textContent,/Recorded interval elapsed never means safe/);
   const now='2026-10-13T12:00:00.000Z',s=await h.repo.snapshot();
   const clean=r=>{const {id,createdAt,updatedAt,...rest}=r;return rest;};
   assert.deepEqual(clean(prepareWorkflow(s,'treatment',{...collect(form),animalId:h.animal.id},now).result),clean(prepareWorkflow(s,'treatment',{...oldData,animalId:h.animal.id},now).result));
  }
 }finally{h.close();}
});
test('common flow budgets, inline errors, backward navigation and work-first order',async()=>{
 const h=await setup();try{
  for(const action of ['weight','move','calving']){await h.render(`dashboard/quick/${action}/${h.animal.id}`);assert.ok(h.root.querySelectorAll('.progress-dots span').length<=5,action);}
  await h.render(`dashboard/quick/treatment/${h.animal.id}`);const form=h.root.querySelector('form');[...form.querySelectorAll('button')].find(b=>b.textContent==='Next').click();assert.match(form.querySelector('.inline-error[role="alert"]').textContent,/LA-200/);
  await h.render('dashboard');assert.ok(h.root.querySelector('.home-work'));assert.ok(h.root.querySelector('.home-work input[type="search"]'));assert.equal(h.root.querySelectorAll('.home-work .quick-actions>.quick-action').length,7);
  await h.render('add');assert.match(h.root.textContent,/Work a group/);
 }finally{h.close();}
});
test('shell has four bottom destinations and device text sizes without changing schema',()=>{
 const dom=new JSDOM(read('app/index.html'));const doc=dom.window.document;
 assert.deepEqual([...doc.querySelectorAll('.app-tabs a')].map(a=>a.dataset.tab),['dashboard','animals','add','backup']);
 assert.deepEqual([...doc.querySelector('#text-size').options].map(o=>o.value),['17','19','22']);
 assert.equal(doc.querySelector('#time-zone').tagName,'SELECT');
 assert.match(read('app/styles.css'),/grid-template-columns:repeat\(4,minmax\(0,1fr\)\);height:56px/);
 assert.doesNotMatch(read('app/lib/guided-form.js'),/reportValidity/);
 assert.doesNotMatch(read('app/lib/last-used.js'),/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
 dom.window.close();
});
test('saving a guided treatment names the animal and opens its audited correction',async()=>{
 const h=await setup();try{
  const status=document.createElement('p');status.id='status';document.body.append(status);
  await h.render(`dashboard/quick/treatment/${h.animal.id}`);const form=h.root.querySelector('form');fill(form,data);
  const next=[...form.querySelectorAll('button')].find(b=>b.textContent==='Next');for(let i=0;i<8&&!next.hidden;i++)next.click();
  assert.ok(next.hidden);await form.onsubmit({preventDefault(){},submitter:form.querySelector('button[type="submit"]')});
  const saved=(await h.repo.snapshot()).treatments[0];assert.ok(saved);
  assert.match(h.messages.at(-1),/^Saved on this phone: treatment.*215/);
  assert.equal(status.querySelector('a').getAttribute('href'),`#health/treatment/${saved.id}`);
  assert.match(read('app/app.js'),/savedNoticeTimer=setTimeout\([\s\S]*?,6000\)/);
 }finally{h.close();}
});
test('a repeated hour requires a choice and a clock gap cannot pass the guide',async()=>{
 const h=await setup();try{
  await h.render(`dashboard/quick/treatment/${h.animal.id}`);const form=h.root.querySelector('form');
  const zone=form.elements.timeZone,local=form.elements.enteredLocalTime,offset=form.elements.offsetMinutes;
  zone.value='America/Los_Angeles';local.value='2026-11-01T01:30';form.refreshTime();assert.equal(offset.value,'');assert.equal(offset.required,true);assert.equal(offset.options.length,3);
  offset.value='-480';form.refreshTime();assert.equal(offset.value,'-480');
  local.value='2026-11-01T01:45';form.refreshTime();assert.equal(offset.value,'','a changed repeated time needs a fresh choice');
  local.value='2026-03-08T02:30';form.refreshTime();assert.equal(offset.value,'');assert.equal(offset.checkValidity(),false);
  form.elements.administrationPrecision.value='date-only';form.elements.administrationPrecision.dispatchEvent(new h.dom.window.Event('change'));assert.equal(offset.required,false);
  [...form.querySelectorAll('button')].find(b=>b.textContent==='Now').click();assert.equal(form.elements.administrationPrecision.value,'instant');assert.ok(local.value);assert.ok(offset.value);
 }finally{h.close();}
});
test('opening a correction keeps its original day, time and explicit repeated-hour choice',async()=>{
 const h=await setup();try{
  const saved=await commitWorkflow(h.repo,await h.repo.snapshot(),'treatment',{...data,animalId:h.animal.id});
  await h.render(`health/treatment/${saved.id}`);const form=h.root.querySelector('form');
  assert.equal(form.elements.administrationDate.value,saved.administrationDate);
  assert.equal(form.elements.enteredLocalTime.value.replace(/\.\d+$/,''),saved.enteredLocalTime.replace(/:00$/,''));
  assert.equal(form.elements.offsetMinutes.value,String(saved.offsetMinutes));
  assert.equal(form.elements.product.value,saved.product);
  assert.equal(form.elements['meat:value'].value,String(saved.meat.value));
  assert.equal((await h.repo.snapshot()).treatments[0].revision,1);
 }finally{h.close();}
});

test('offline status stays below work with update failures inside closed details',()=>{
 const dom=new JSDOM(read('app/index.html'));const doc=dom.window.document;
 const main=doc.querySelector('#main'),panel=doc.querySelector('#pwa-panel');
 assert.ok(main.compareDocumentPosition(panel)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.equal(panel.querySelector('details').open,false);
 assert.equal(doc.querySelector('#offline-status').tagName,'SUMMARY');
 for(const id of ['update-status','pwa-update','update-backup','install-guidance'])assert.equal(doc.getElementById(id).closest('details'),panel.querySelector('details'));
 dom.window.close();
});
test('larger text offers four launch actions plus More',async()=>{
 const h=await setup();try{
  document.documentElement.style.fontSize='22px';await h.render('dashboard');
  assert.equal(h.root.querySelectorAll('.home-work .quick-actions>.quick-action').length,4);
  assert.equal(h.root.querySelectorAll('.home-work details .quick-action').length,3);
  assert.equal(h.root.querySelector('.home-work details').open,false);
 }finally{h.close();}
});

test('guides keep one visible question and plain tag start wording',async()=>{
 const h=await setup();try{
  await h.render('dashboard/quick/animal');
  const form=h.root.querySelector('.guided-form');assert.ok(form);
  assert.ok(form.querySelector('.fields > .guide-question'));
  for(const label of form.querySelectorAll('label')){
   assert.doesNotMatch(label.firstChild.textContent,/\b(identifiers?|membership|effective|precision|administration|offset)\b/i);
   const control=label.querySelector('input,select,textarea');assert.ok(control.labels.length);
  }
  const first=form.querySelector('label:not([hidden])');assert.ok(first.querySelector('.guide-label-hidden'));
  assert.equal(form.elements.effectiveDate.labels[0].firstChild.textContent,'What date did this tag and group start?');
 }finally{h.close();}
});
