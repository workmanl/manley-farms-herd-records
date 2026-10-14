// SPDX-License-Identifier: AGPL-3.0-only
import {readDevice,writeDevice} from './device-safety.js';
import {plainOption} from './copy.js';
export const REUSE_FIELDS=['product','doseUnit','route','routeOther','injectionSite','administrator'];
export function reusable(data){return Object.fromEntries(REUSE_FIELDS.map(k=>[k,data[k] || '']));}
export function rememberTreatment(storage,operation,data){
 const previous=readDevice(storage).lastTreatments || {};
 const waits=Object.fromEntries(Object.entries(data).filter(([k])=>/^(meat|milk):/.test(k)&&!/(directedRelease|resolved|resolution)/.test(k)));
 writeDevice(storage,{lastTreatments:{...previous,[operation]:{...reusable(data),waits}}});
}
export function treatmentTools(form,operation,storage){
 const last=readDevice(storage).lastTreatments?.[operation];if(!last)return;
 const make=(text,fn,parent)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;parent.append(b);};
 const put=(key,value)=>{const c=form.elements.namedItem(key);if(c){if(c.type==='checkbox')c.checked=value===true;else c.value=value;c.dispatchEvent(new form.ownerDocument.defaultView.Event('input',{bubbles:true}));}};
 make(`Same as last time: ${last.product}`,()=>{for(const [k,v]of Object.entries(reusable(last)))put(k,v);},form.elements.namedItem('product').closest('label'));
 for(const kind of ['meat','milk']){
  const waits=Object.entries(last.waits || {}).filter(([k])=>k.startsWith(kind+':'));
  if(!waits.length)continue;
  const summary=waits.filter(([k,v])=>v&& !k.endsWith('zeroConfirmed')).map(([k,v])=>plainOption(v)).join(', ');
  make(`Use last ${kind} answers for ${last.product}: ${summary}. Check these answers.`,()=>{
   if(form.elements.namedItem('product').value!==last.product)return;
   for(const [k,v]of waits)put(k,v);
  },form.elements.namedItem(kind+':state').closest('label'));
 }
}
