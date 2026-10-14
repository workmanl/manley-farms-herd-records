// SPDX-License-Identifier: AGPL-3.0-only
// Presentation only. The original form owns collection, validation and commit.
export function guideForm(form, { selection=false }={}) {
 if(!form)return;
 const document=form.ownerDocument;
 const body=form.querySelector('.fields');if(!body)return;
 form.classList.add('guided-form');
 form.noValidate=true;
 for(const d of body.querySelectorAll('details'))d.open=true;
 const labels=[...body.querySelectorAll('label')];
 if(!labels.length)return;
 const essentials = new Set(['farmId','visualTag','sex','birthDate','birthDatePrecision','effectiveDate','date','value','unit','type','groupId','pasture','revisionReason','serviceDate','method','sireReference','result','destination','acknowledgeDeparture','administrationPrecision','administrationDate','enteredLocalTime','timeZone','offsetMinutes','doseValue','doseUnit','route','injectionSite','meat:state','meat:value','meat:unit','meat:source','meat:instructionReference','milk:state','milk:value','milk:unit','milk:source','milk:instructionReference','notes']);
 const questions=labels.filter(l=>{const c=l.querySelector('input,select,textarea');return c.required||essentials.has(c.name)||c.name.startsWith('calf0:visualTag')||c.name.startsWith('calf0:sex');});
 const translations={'Farm ID':'What do you call this animal?','Visual tag (text)':'What is on the ear tag?','DOB precision':'How sure are you of the birth date?','dam in herd':'Mother in your herd','sire in herd':'Father in your herd','Pasture text':'Pasture name','Administration precision':'Do you know the treatment time?','Administration date':'What day was the treatment?','Administrator':'Who gave the treatment?','Route':'How was the treatment given?','Injection site':'Where was the shot given?','Entered interval':'How long is the wait?','Interval unit':'Hours or days?','Instruction source':'Where did the instructions come from?','Label or veterinarian instruction reference':'Which label or vet instructions did you use?','Sire in herd':'Father in your herd','Dam in herd':'Mother in your herd','Sex':'Male, female or steer?','External sire / semen reference':'Father or semen details from outside your herd','Examiner':'Who did the check?','Linked breeding':'Which breeding record goes with this check?','Movement type':'Was this animal sold, bought or moved?','Receipt reference':'Receipt number or note','Sale amount (decimal text)':'Sale price','Exposure start':'First day with the bull','Exposure end (blank if ongoing)':'Last day with the bull (leave blank if still together)'};
 for(const label of labels){const text=label.firstChild;if(text?.nodeType===3&&translations[text.textContent])text.textContent=translations[text.textContent];}
 const sticky=form.querySelector('.sticky'),actions=sticky.querySelector('.actions');
 const submit=actions.querySelector('button[type=submit]');submit.textContent='Save record';
 actions.querySelector('button[value=next]')?.remove();
 const cancel=actions.querySelector('a');if(cancel){cancel.textContent='Cancel';cancel.href='#dashboard';}
 const progress=document.createElement('p');progress.className='guide-progress';progress.setAttribute('role','status');
 const dots=document.createElement('div');dots.className='progress-dots';dots.setAttribute('aria-hidden','true');
 // One dot per question, in a horizontally scrollable strip for full clinical forms.
 const offset=selection?1:0;
 Array.from({length:questions.length+offset+1}).forEach(()=>{const dot=document.createElement('span');dots.append(dot);});
 form.prepend(progress,dots);
 let step=0,review=false;
 const back=document.createElement('button');back.type='button';back.textContent='Back';
 const next=document.createElement('button');next.type='button';next.textContent='Next';actions.prepend(back,next);
 const show=(focus=true)=>{
 labels.forEach(label=>label.hidden=!review&&label!==questions[step]);
 progress.textContent=`Step ${review?questions.length+offset+1:step+offset+1} of ${questions.length+offset+1}${review?': Check your answers, then save.':''}`;
 [...dots.children].forEach((dot,i)=>dot.classList.toggle('current',i===(review?questions.length+offset:step+offset)));
 back.disabled=!review&&step===0;next.hidden=review;submit.hidden=!review;
 if(focus){const target=review?progress:questions[step].querySelector('input,select,textarea');target?.focus({preventScroll:true});(review?progress:questions[step]).scrollIntoView?.({block:'nearest'});}
 };
 progress.tabIndex=-1;
 next.onclick=()=>{const input=questions[step].querySelector('input,select,textarea');if(input&&!input.reportValidity())return;if(step===questions.length-1)review=true;else step++;show();};
 back.onclick=()=>{if(review)review=false;else step--;show();};
 // Enter advances instead of saving an unfinished guide.
 const save=form.onsubmit;form.onsubmit=e=>{if(!review){e.preventDefault();next.click();return;}if(!form.checkValidity()){e.preventDefault();form.reportValidity();return;}return save(e);};
 form.addEventListener('invalid',e=>{const index=questions.findIndex(l=>l.contains(e.target));if(index>=0){step=index;review=false;show(false);}},true);
 // Twins add controls after the guide was built. Restart presentation over the same form.
 const observer=new form.ownerDocument.defaultView.MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('label,fieldset')||n.querySelector?.('label'))))){observer.disconnect();labels.forEach(l=>l.hidden=false);progress.remove();dots.remove();back.remove();next.remove();form.onsubmit=save;guideForm(form, {selection});}});
 observer.observe(body,{childList:true,subtree:true});
 show(false);
 if(form.isConnected) form.scrollIntoView?.({block:'start'});
}

export function pickerProgress(form, count){
 const document=form.ownerDocument;
 const progress=document.createElement('p');progress.className='guide-progress';progress.setAttribute('role','status');progress.textContent=`Step 1 of ${count}`;
 const dots=document.createElement('div');dots.className='progress-dots';dots.setAttribute('aria-hidden','true');
 for(let i=0;i<count;i++){const dot=document.createElement('span');if(!i)dot.className='current';dots.append(dot);}form.prepend(progress,dots);
}
