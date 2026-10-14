import {humanWhen} from './when.js';
// SPDX-License-Identifier: AGPL-3.0-only
import { evaluateWithdrawal, isHold, DASHBOARD_NOTICE } from './withdrawal.js';
import { searchAnimals, events } from './workflows.js';
import { backupReminder } from './reminders.js';
import { readDevice } from './device-safety.js';
export const quickActions = [['calving','Add a calf','calf'],['animal','Add an animal','plus'],['treatment','Record a treatment','health'],['weight','Weigh','weight'],['move','Move to a pasture or group','move'],['breeding','Breeding or pregnancy check','calf'],['movement','Sold or died','move']];
const paths = {plus:'M12 5v14M5 12h14',calf:'M5 8 3 4m16 4 2-4M5 8h14v10l-7 3-7-3zM8 12h.01M16 12h.01M9 17h6',health:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',weight:'M5 7h14l2 14H3zM9 7a3 3 0 0 1 6 0M12 11v4',move:'M3 12h17m-6-6 6 6-6 6',milk:'M9 3h6v5l3 4v9H6v-9l3-4zM6 14h12',check:'M4 12l5 5L20 6',backup:'M5 4h14v16H5zM8 4v6h8V4M9 20v-6h6v6',search:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14m5-2 6 6'};
export function icon(name) { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); for(const [k,v] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v); const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.calf);svg.append(p);return svg; }
export function dashboardModel(s, today, now=new Date().toISOString()) {
 const evaluation=evaluateWithdrawal(s,{now});
 const year=today.slice(0,4); const calves=s.animals.filter(a=>a.birthDate?.startsWith(year)&&!a.voidedAt).length;
 const last=s.metadata[0].lastUserConfirmedBackupAt;
 const attention=[];
 if(evaluation.clockReviewRequired)attention.push({text:'The device clock moved backward. Check the clock and review the holds.',href:'#health/clock',fix:'Check clock'});
 if(evaluation.counts.review)attention.push({text:`${evaluation.counts.review} ${evaluation.counts.review===1?'animal needs':'animals need'} a check: check their saved times, waits and instructions.`,filter:{withdrawal:'needs-review',includeInactive:true},fix:'Check records'});
 for(const row of evaluation.animals.filter(r=>isHold(r.meat.status)||isHold(r.milk.status)).slice(0,5)){
 const commodity=isHold(row.meat.status)?'meat':'milk',hold=row[commodity];
 attention.push({text:`${row.animal.farmId} is on a ${commodity} hold${hold.releaseAt?` until ${new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:s.operation[0].timeZone}).format(new Date(hold.releaseAt))}`:'. Needs review: '+hold.reasons.join('; ')}.`,href:`#animals/${row.animal.id}`,fix:'Review hold'});
 }

 return {evaluation,calves,last,attention,empty:s.animals.length===0,active:s.animals.filter(a=>a.status==='active').length};
}
export function drawDashboard(h,{el,link,button,field}) {
 const m=dashboardModel(h.s,h.today);h.title('Your herd');
 h.root.append(el('p',m.empty?'Let’s start your herd.':'Ready for today’s herd work.','dashboard-greeting'));

 const backup=el('section');h.root.append(backup);h.backupPanel?.(backup);
 const filter=f=>{h.filters={...f,page:1};location.hash='#animals';};
 const stats=el('section',undefined,'dashboard-stats');stats.setAttribute('aria-label','Herd snapshot');
 for(const [label,count,type,f] of [['Cattle on the farm',m.active,'calf',{status:'active'}],['Calves this year',m.calves,'calf',{birthFrom:h.today.slice(0,4)+'-01-01',birthTo:h.today.slice(0,4)+'-12-31',includeInactive:true}],['On a meat hold',m.evaluation.counts.meat,'health',{withdrawal:'meat-hold',includeInactive:true}],['On a milk hold',m.evaluation.counts.milk,'milk',{withdrawal:'milk-hold',includeInactive:true}],['Needs a check',m.evaluation.counts.review,'check',{withdrawal:'needs-review',includeInactive:true}],['Last backup',m.last?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:h.s.operation[0].timeZone}).format(new Date(m.last)):'Not yet','backup',null]]){const tile=button('',()=>f?filter(f):location.hash='#backup');tile.className='snapshot-tile secondary';tile.append(icon(type),el('strong',count),el('span',label));stats.append(tile);}h.root.append(stats);
 h.root.append(el('p','Hold counts include sold and archived cattle. One animal can be in more than one count.','muted'));
 const tip=el('details');tip.append(el('summary','? What is a hold?'),el('p','A hold means a recorded treatment still needs time or a check before meat or milk can be used. Needs a check means information or instructions are missing. Ask your veterinarian and check the label. An elapsed interval never means safe.'));h.root.append(tip);
 if(m.empty){const welcome=el('section',undefined,'card welcome');welcome.append(el('h2','Your first three steps'),el('p','1. Add your first animal.'),link('Add my first animal','#dashboard/quick/animal'),el('p','2. Record a weight, birth or treatment.'),el('p','3. Back up your records outside this browser.'));if(!h.demoMode&&h.demo)welcome.append(button('Try it with sample cattle',()=>h.demo(true)));h.root.append(welcome);}
 const actions=el('section',undefined,'card');actions.append(el('h2','What would you like to do?'));const grid=el('div',undefined,'quick-actions');for(const [action,label,type]of quickActions){const a=link('',`#dashboard/quick/${action}`);a.className='button secondary quick-action';a.append(icon(type),el('span',label));grid.append(a);}actions.append(grid);h.root.append(actions);
 const columns=el('div',undefined,'dashboard-columns');const today=el('section',undefined,'card today-list');today.append(el('h2','Today'));for(const item of m.attention){const row=el('article');row.append(el('p',item.text),item.filter?button(item.fix,()=>filter(item.filter)):link(item.fix,item.href));today.append(row);}if(!m.attention.length)today.append(el('p','No recorded holds or checks need attention today. Keep checking your animals and their instructions.'));today.append(h.health.safetyNote());columns.append(today);
 const find=el('section',undefined,'card');find.append(el('h2','Find an animal'));const search=el('form');const input=field(search,'query','Type a tag or name','',{type:'search',placeholder:'Type a tag or name'});const go=el('button','Find');go.setAttribute('aria-label','Find animal');go.type='submit';search.append(go);search.onsubmit=e=>{e.preventDefault();filter({query:input.value,includeInactive:true});};find.append(search,el('h3','Recent animals'));
 const byId=new Map(h.s.animals.map(a=>[a.id,a]));const ids=[...new Set([...(h.recentAnimals||[]),...events(h.s,{limit:5}).flatMap(e=>e.animalIds)])];let recent=ids.map(id=>byId.get(id)).filter(Boolean).slice(0,4);if(!recent.length)recent=searchAnimals(h.s,{pageSize:4}).rows;for(const a of recent)find.append(link(`${a.visualTag||a.farmId} · ${a.farmId}`,`#animals/${a.id}`));if(!recent.length)find.append(el('p','Your animals will appear here.'));columns.append(find);h.root.append(columns);
 const work=el('section',undefined,'home-work');const finder=el('div',undefined,'home-find');finder.append(find.querySelector('h2'),search);work.append(finder,actions);h.root.insertBefore(work,h.root.children[1]);
 if(largeText()){const more=el('details');more.append(el('summary','More'));for(const a of [...grid.children].slice(4))more.append(a);actions.append(more);}
 const tools=el('div',undefined,'actions');tools.append(link('More herd work','#add'),link('Events','#events'),link('Reports','#reports'));h.root.append(tools);
 h.root.append(el('h2','Recent activity'));const activity=el('ul',undefined,'rows');
 for(const item of recentActivity(h.s)){const row=el('li',undefined,'card activity-row');row.append(icon(item.icon),el('p',item.text),el('small',item.relative));if(item.store==='treatments')row.append(link('Undo this treatment',`#health/void/${item.record.id}`));activity.append(row);}
 if(!activity.children.length)activity.append(el('li','Your births, weights and other herd work will appear here.'));
 h.root.append(activity);
 const detailed=el('details',undefined,'card');detailed.append(el('summary','All hold details and recorded wait times'));h.root.append(detailed);const old=h.root;h.root=detailed;h.health.mount();h.root=old;
}

// The Events tab keeps its full technical history. Home shows only herd work.
export function recentActivity(s, now=new Date().toISOString(), limit=5){
 const stores=new Set(['calvings','weights','breedings','pregnancyChecks','movements','treatments','memberships']);
 const name=id=>s.animals.find(a=>a.id===id)?.farmId||'Animal';
 const evaluation=evaluateWithdrawal(s,{now});
 const rows=[...stores].flatMap(type=>events(s,{type,limit:Math.max(10,limit*2)})).sort((a,b)=>b.date.localeCompare(a.date)||a.record.id.localeCompare(b.record.id)).filter(e=>stores.has(e.store)&&!e.record.voidedAt&&(e.store!=='memberships'||e.record.revision===1));
 const result=[];
 const moves=new Set();
 for(const e of rows){const r=e.record;let text,type='calf';
 if(e.store==='calvings')text=`${name(r.damId)} had ${r.calves.length===2?'twins':'a calf'}`;
 if(e.store==='weights'){text=`Weighed ${name(r.animalId)}: ${new Intl.NumberFormat('en-US').format(r.value)} ${r.unit}`;type='weight';}
 if(e.store==='breedings')text=`Recorded breeding for ${name(r.damId)}`;
 if(e.store==='pregnancyChecks')text=`Checked ${name(r.animalId)} for pregnancy: ${r.result}`;
 if(e.store==='movements'){text=`${r.type==='sale'?'Sold':r.type==='death'?'Recorded the death of':'Moved'} ${name(r.animalId)}`;type='move';}
 if(e.store==='treatments'){const hold=evaluation.animals.find(a=>a.animal.id===r.animalId);const commodity=isHold(hold?.meat.status)?'meat':isHold(hold?.milk.status)?'milk':null;const end=commodity&&hold[commodity].releaseAt;text=`Treated ${name(r.animalId)}${commodity?` (${commodity} hold${end?' until '+new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:s.operation[0].timeZone}).format(new Date(end)):', needs a check'})`:''}`;type='health';}
 if(e.store==='memberships'){const key=r.groupId+':'+r.startDate;if(moves.has(key))continue;moves.add(key);const count=s.memberships.filter(x=>!x.voidedAt&&x.groupId===r.groupId&&x.startDate===r.startDate).length;text=`Moved ${count===1?name(r.animalId):count+' cattle'} to ${s.groups.find(g=>g.id===r.groupId)?.name||r.pastureSnapshot||'a group'}`;type='move';}
 const days=Math.round((Date.parse(now.slice(0,10))-Date.parse(e.date.slice(0,10)))/86400000);
 result.push({...e,text,icon:type,relative:days===0?'Today':days===1?'Yesterday':days>1?`${days} days ago`:`In ${-days} days`});if(result.length===limit)break;
 }
 return result;
}

// Saved text size wins over the inline style, which may not be applied yet on the first render.
function largeText() {
  let saved = 0;
  try { saved = Number(readDevice(globalThis.localStorage)?.textSize) || 0; } catch {}
  const inline = parseFloat(globalThis.document?.documentElement?.style?.fontSize || '0') || 0;
  return Math.max(saved, inline) > 17;
}
