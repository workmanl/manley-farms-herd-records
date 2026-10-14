// SPDX-License-Identifier: AGPL-3.0-only
import {localParts} from './withdrawal.js';
export function timeChoices(local, zone) {
 const clean=local.replace(/\.\d+$/,''), full=clean.length===16?clean+':00':clean, found=[];
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(full))return found;
 const base=Date.parse(full+'Z');if(!Number.isFinite(base))return found;
 const offsets=new Set();
 // Observe both sides of a clock change, including zones with a half-hour shift.
 for(let hours=-48;hours<=48;hours+=6){const sample=base+hours*3600000;const wall=Date.parse(localParts(new Date(sample).toISOString(),zone)+'Z');const offset=(wall-sample)/60000;if(Number.isInteger(offset)&&Math.abs(offset)<=840)offsets.add(offset);}
 for(const offset of offsets){
  const instant=new Date(Date.parse(full+'Z')-offset*60000).toISOString();
  if(localParts(instant,zone)===full)found.push({offset,instant});
 }
 return found.sort((a,b)=>a.instant.localeCompare(b.instant));
}
export function humanWhen(value, zone, now=Date.now()) {
 if(!value)return 'Not known yet';
 const dateOnly=/^\d{4}-\d\d-\d\d$/.test(value);
 const date=new Date(value);if(!Number.isFinite(+date))return value;
 const device=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const sameZone=!zone || Intl.DateTimeFormat('en-US',{timeZone:zone}).resolvedOptions().timeZone===device;
 const days=Math.ceil((+date-now)/86400000);
 return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',...(date.getUTCFullYear()!==new Date(now).getUTCFullYear()?{year:'numeric'}:{}),...(value.includes('T')?{hour:'numeric',minute:'2-digit'}:{}),timeZone:dateOnly?'Etc/UTC':zone,...(!dateOnly&&zone&&!sameZone?{timeZoneName:'short'}:{})}).format(date).replace(/\bUTC\b/g,'world clock')+(days>0?` (in ${days} ${days===1?'day':'days'})`:'');
}
export function setupTime(form, {preserve=false}={}) {
 if(form.refreshTime)return;
 const get=n=>form.elements.namedItem(n), zone=get('timeZone')?.value;
 if(!zone)return;
 const local=get('enteredLocalTime'); let offset=get('offsetMinutes');
 const now=()=>{get("administrationPrecision").value="instant";local.required=false;local.value=localParts(new Date().toISOString(),zone);update();};
 let lastLocal=preserve?local.value:undefined;
 const update=()=>{
  if(!local.value)return;
  if(get('administrationPrecision').value==='instant')get('administrationDate').value=local.value.slice(0,10);
  const previous=offset.value;const choices=timeChoices(local.value,get("timeZone").value);offset.replaceChildren();
  if(choices.length!==1){const o=document.createElement('option');o.value='';o.textContent=choices.length?'Choose first or second time':'This time did not happen. Pick another time.';offset.append(o);}
  choices.forEach((c,i)=>{const o=document.createElement('option');o.value=c.offset;o.textContent=i?'Second time':'First time';offset.append(o);});
  if(choices.length>1 && local.value===lastLocal && choices.some(c=>String(c.offset)===previous))offset.value=previous;
  lastLocal=local.value;
  offset.required=get('administrationPrecision').value==='instant';
  offset.closest('label').hidden=choices.length===1;
 };
 const select=document.createElement('select');select.name=offset.name;select.id=offset.id;offset.replaceWith(select);
 // Use the original record fields. No new timing rule or write path.
 offset=select;
 get("timeZone").addEventListener("change",()=>{lastLocal=undefined;update();});
 form.refreshTime=update;local.addEventListener("input",update);get("administrationPrecision").addEventListener("change",()=>{local.required=get('administrationPrecision').value==='instant';update();});
 const row=document.createElement("div");row.className="time-tools";
 for(const [title,fn] of [["Now",now],["Earlier today",()=>{get("administrationPrecision").value="instant";local.value="";get("administrationDate").value=localParts(new Date().toISOString(),zone).slice(0,10);local.required=true;offset.required=true;offset.replaceChildren();local.focus();}],["Pick a day and time",()=>{get("administrationPrecision").value="instant";local.required=true;local.focus();}]]){const b=document.createElement("button");b.type="button";b.textContent=title;b.onclick=fn;row.append(b);}
 local.closest("label").prepend(row);if(preserve){local.required=get("administrationPrecision").value==="instant";update();}else now();
}
