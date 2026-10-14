import {entryError,plainOption,plainLabel} from './copy.js';
import {setupTime} from './when.js';
// SPDX-License-Identifier: AGPL-3.0-only
// Presentation only. The original form owns collection, validation and commit.
export function guideForm(form, { selection=false }={}) {
 if(!form)return;
 const document=form.ownerDocument;
 const body=form.querySelector('.fields');if(!body)return;
 form.classList.add('guided-form');
 form.noValidate=true;
 for(const d of body.querySelectorAll('details'))d.open=false;
 const labels=[...body.querySelectorAll('label')];
 if(!labels.length)return;
 const essentials = new Set(['farmId','visualTag','sex','birthDate','birthDatePrecision','effectiveDate','date','value','unit','type','groupId','pasture','revisionReason','serviceDate','method','sireReference','result','destination','acknowledgeDeparture','administrationPrecision','administrationDate','enteredLocalTime','timeZone','offsetMinutes','doseValue','doseUnit','route','injectionSite','meat:state','meat:value','meat:unit','meat:source','meat:instructionReference','milk:state','milk:value','milk:unit','milk:source','milk:instructionReference','notes']);
 let questions=labels.filter(l=>{const c=l.querySelector('input,select,textarea');return c.required||essentials.has(c.name)||c.name.startsWith('calf0:visualTag')||c.name.startsWith('calf0:sex');});
 const translations={'Farm ID':'What do you call this animal?','Visual tag (text)':'What is on the ear tag?','DOB precision':'How sure are you of the birth date?','dam in herd':'Mother in your herd','sire in herd':'Father in your herd','Pasture text':'Pasture name','Administration precision':'Do you know the treatment time?','Administration date':'What day was the treatment?','Administrator':'Who gave the treatment?','Route':'How was the treatment given?','Injection site':'Where was the shot given?','Entered interval':'How long is the wait?','Interval unit':'Hours or days?','Instruction source':'Where did the instructions come from?','Label or veterinarian instruction reference':'Which label or vet instructions did you use?','Sire in herd':'Father in your herd','Dam in herd':'Mother in your herd','Sex':'Male, female or steer?','External sire / semen reference':'Father or semen details from outside your herd','Examiner':'Who did the check?','Linked breeding':'Which breeding record goes with this check?','Movement type':'Was this animal sold, bought or moved?','Receipt reference':'Receipt number or note','Sale amount (decimal text)':'Sale price','Exposure start':'First day with the bull','Exposure end (blank if ongoing)':'Last day with the bull (leave blank if still together)'};
 for(const label of labels){const text=label.firstChild;if(text?.nodeType===3&&translations[text.textContent])text.textContent=translations[text.textContent];}
 for(const label of labels){const text=label.firstChild;if(text?.nodeType===3){const caption=document.createElement('span');caption.className='guide-label';caption.textContent=plainLabel(text.textContent).replace(/\bidentifiers?\b/gi,'tags').replace(/\bmembership\b/gi,'group history').replace(/\beffective\b/gi,'start').replace(/\bprecision\b/gi,'how sure you are').replace(/\badministration\b/gi,'dose').replace(/\boffset\b/gi,'clock difference');text.replaceWith(caption);}}
 const action=form.dataset.guideAction;
 if(action==='treatment')setupTime(form);
 const names=l=>l.querySelector('input,select,textarea')?.name;
 const treatment=[['product','lot','expiryDate'],['doseValue','doseUnit','notes'],['route','routeOther','injectionSite','administrator','reason','instructionReference','veterinarian','courseId','newCourse'],['administrationPrecision','administrationDate','enteredLocalTime','offsetMinutes'],labels.map(names).filter(n=>n?.startsWith('meat:')&&!/directedRelease|resolved|resolution/.test(n)),labels.map(names).filter(n=>n?.startsWith('milk:')&&!/directedRelease|resolved|resolution/.test(n))];
 const common=action==='weight'?[['date','type'],['value','unit','notes']]:action==='move'?[['groupId','pasture'],['date','revisionReason']]:action==='calving'?[labels.map(names).filter(n=>!n?.startsWith('calf')),labels.map(names).filter(n=>n?.startsWith('calf'))]:null;
 const groups=(action==='treatment'?treatment:common)?.map(group=>labels.filter(l=>group.includes(names(l)))).filter(g=>g.length) || questions.map(l=>[l]);
 questions=groups.map(g=>g[0]);
 const optional=labels.filter(l=>!groups.some(g=>g.includes(l)));
 const extra=document.createElement('details');extra.className='guide-extra';const summary=document.createElement('summary');summary.textContent='Add more details';extra.append(summary);for(const l of optional)extra.append(l);body.append(extra);
 const sticky=form.querySelector('.sticky'),actions=sticky.querySelector('.actions');
 for(const status of sticky.querySelectorAll('p'))if(status.textContent==='Not saved.')status.classList.add('guide-unsaved');
 const submit=actions.querySelector('button[type=submit]');submit.textContent='Save record';
 actions.querySelector('button[value=next]')?.remove();
 const cancel=actions.querySelector('a');if(cancel){cancel.textContent='Cancel';cancel.href='#dashboard';}
 const progress=document.createElement('p');progress.className='guide-progress';progress.setAttribute('role','status');
 const dots=document.createElement('div');dots.className='progress-dots';dots.setAttribute('aria-hidden','true');
 const bar=document.createElement('div');bar.className='progress-bar';bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','1');
 const fill=document.createElement('span');bar.append(fill);
 // Dots stay for step counts. The bar is what the farmer sees.
 const offset=selection?1:0;
 Array.from({length:questions.length+offset+1}).forEach(()=>{const dot=document.createElement('span');dots.append(dot);});
 form.prepend(progress,bar,dots);
 const heading=document.createElement('h2');heading.className='guide-question';heading.tabIndex=-1;body.prepend(heading);
 const reviewPanel=document.createElement('section');reviewPanel.className='guide-review';body.append(reviewPanel);
 let step=0,review=false;
 const back=document.createElement('button');back.type='button';back.textContent='Back';
 const next=document.createElement('button');next.type='button';next.textContent='Next';actions.prepend(back,next);
 const revealControl=control=>{control?.scrollIntoView?.({block:'nearest',inline:'nearest'});};
 body.addEventListener('focusin',event=>{if(event.target.matches('input,select,textarea,button'))revealControl(event.target);});
 const show=(focus=true)=>{
 heading.textContent=review?'Check your answers':action==='treatment'?['What product did you give?','How much did you give?','How did you give it?','When did you give it?','MEAT: how long must you wait?','MILK: how long must you wait?'][step]:questions[step].firstChild.textContent.replace(/\?$/,'')+'?';
 labels.forEach(label=>{label.hidden=review || !groups[step]?.includes(label);label.firstChild.classList.toggle('guide-label-hidden',!review && label.firstChild.textContent.replace(/\?$/,'')===heading.textContent.replace(/\?$/,''));});
 reviewPanel.hidden=!review;reviewPanel.replaceChildren();
 if(review){
  const add=text=>{const p=document.createElement('p');p.textContent=text;reviewPanel.append(p);};
  const val=n=>form.elements.namedItem(n)?.value || 'Not given';
  if(action==='treatment'){add(`${form.dataset.animalName} got ${val('product')}: ${val('doseValue')} ${val('doseUnit')}. ${plainOption(val('route'))}, ${val('injectionSite')}.`);add(`Given by ${val('administrator')} on ${val('administrationDate')}, ${val('administrationPrecision')==='instant'?val('enteredLocalTime').replace('T',' at ')+' '+(form.elements.namedItem('offsetMinutes').selectedOptions[0]?.textContent || ''):'day only, needs a check'}.`);for(const kind of ['meat','milk'])add(`${plainOption(kind)}: ${plainOption(val(kind+':state'))}. ${val(kind+':state')==='duration'?val(kind+':value')+' '+plainOption(val(kind+':unit')):''} Check the label and your vet. Recorded interval elapsed never means safe.`);for(const kind of ['meat','milk']){add(`${plainOption(kind)} instructions: ${plainOption(val(kind+':source'))}. ${val(kind+':instructionReference')}. ${val(kind+':instructionText')}.`);if(val(kind+':state')==='duration'&&Number(val(kind+':value'))===0)add(`${plainOption(kind)} zero wait confirmed: ${form.elements.namedItem(kind+':zeroConfirmed').checked?'Yes':'No'}.`);}}
  else for(const group of groups)for(const label of group){const c=label.querySelector('input,select,textarea');add(`${label.firstChild.textContent}: ${c.type==='checkbox'?(c.checked?'Yes':'No'):c.tagName==='SELECT'?c.selectedOptions[0]?.textContent:c.value || 'Not given'}`);}
 }
 extra.hidden=!review;
 for(const l of optional)l.hidden=!review;
 if(action === "treatment") {const c=form.elements.namedItem("offsetMinutes");if(c?.options?.length===1)c.closest("label").hidden=true;form.elements.namedItem("timeZone").closest("label").hidden=true;}
 const total=questions.length+offset+1, current=review?total:step+offset+1;
 progress.textContent=`Step ${current} of ${total}${review?': Check your answers, then save.':''}`;
 [...dots.children].forEach((dot,i)=>dot.classList.toggle('current',i===(review?questions.length+offset:step+offset)));
 bar.setAttribute('aria-valuenow',String(current));bar.setAttribute('aria-valuemax',String(total));bar.setAttribute('aria-label',progress.textContent);
 fill.style.width=`${Math.round(current/total*100)}%`;
 body.dataset.step=String(current);
 back.disabled=!review&&step===0;next.hidden=review;submit.hidden=!review;
 if(focus){body.scrollTop=0;const target=review?progress:heading;target?.focus({preventScroll:true});if(!review)revealControl(groups[step].flatMap(l=>[...l.querySelectorAll('input,select,textarea')]).find(c=>!c.disabled));}
 };
 progress.tabIndex=-1;
 next.onclick=()=>{const inputs=groups[step].map(l=>l.querySelector('input,select,textarea'));const input=inputs.find(c=>!c.checkValidity());if(input){let error=input.parentNode.querySelector('.inline-error');if(!error){error=document.createElement('span');error.className='inline-error';error.setAttribute('role','alert');input.parentNode.append(error);}error.textContent=entryError(input);input.focus();return;}if(step===questions.length-1)review=true;else step++;show();};
 back.onclick=()=>{if(review)review=false;else step--;show();};
 // Enter advances instead of saving an unfinished guide.
 const save=form.onsubmit;form.onsubmit=e=>{if(!review){e.preventDefault();next.click();return;}if(!form.checkValidity()){e.preventDefault();return;}return save(e);};
 form.addEventListener('invalid',e=>{const index=groups.findIndex(g=>g.some(l=>l.contains(e.target)));if(index>=0){step=index;review=false;show(false);}},true);
 // Twins add controls after the guide was built. Restart presentation over the same form.
 const observer=new form.ownerDocument.defaultView.MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('label,fieldset')||n.querySelector?.('label'))))){observer.disconnect();labels.forEach(l=>l.hidden=false);progress.remove();bar.remove();dots.remove();back.remove();next.remove();reviewPanel.remove();heading.remove();for(const l of optional)body.append(l);extra.remove();form.onsubmit=save;guideForm(form, {selection});}});
 observer.observe(body,{childList:true,subtree:true});
 show(false);
 if(form.isConnected) form.scrollIntoView?.({block:'start'});
 document.defaultView.requestAnimationFrame?.(()=>{if(!review)revealControl(groups[step]?.[0]?.querySelector('input,select,textarea'));});
}

export function pickerProgress(form, count){
 const document=form.ownerDocument;
 const progress=document.createElement('p');progress.className='guide-progress';progress.setAttribute('role','status');progress.textContent=`Step 1 of ${count}`;
 const dots=document.createElement('div');dots.className='progress-dots';dots.setAttribute('aria-hidden','true');
 const bar=document.createElement('div');bar.className='progress-bar';bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','1');bar.setAttribute('aria-valuenow','1');bar.setAttribute('aria-valuemax',String(count));bar.setAttribute('aria-label',progress.textContent);
 const fill=document.createElement('span');fill.style.width=`${Math.round(100/count)}%`;bar.append(fill);
 for(let i=0;i<count;i++){const dot=document.createElement('span');if(!i)dot.className='current';dots.append(dot);}form.prepend(progress,bar,dots);
}
