// SPDX-License-Identifier: AGPL-3.0-only
const words = {
 instant:'Day and time known', 'date-only':'Day only, needs a check', duration:'Wait for a set time', unknown:'Not known yet',
 'not-applicable':'Does not apply', prohibited:'Do not use', 'manual-review':'Needs a vet check',
 ISO:'Year, month, day',MDY:'Month, day, year',DMY:'Day, month, year', IM:'In the muscle', SC:'Under the skin', IV:'In a vein', oral:'By mouth', topical:'On the skin', intranasal:'In the nose',
 label:'Product label', vet:'Vet instructions', hours:'Hours', days:'Days', lb:'Pounds', kg:'Kilograms',
 animals:'Animals',identifiers:'Tags',memberships:'Group history',calvings:'Calf births',weights:'Weights',breedings:'Breeding records',pregnancyChecks:'Pregnancy checks',movements:'Sales and moves',treatments:'Treatments',treatmentCourses:'Linked doses',revisions:'Change history',operation:'Farm settings',metadata:'App settings',groups:'Groups and pastures',
 'management-lot':'Work group', AI:'Artificial breeding', natural:'With a bull',
};
export function plainOption(value) { const text=String(value); return words[value] || (/^[a-zA-Z]+(?:[-_][a-zA-Z]+)*$/.test(text)?text.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase()):text); }
export function plainLabel(text) {
 const labels={'Effective date for identifiers and membership':'What date did this tag and group start?', 'Effective date':'What date did this start?', 'Single administration':'One dose', 'No final administration':'No last dose','Calving ease · local scale, no registry equivalence':'How much help did the birth need?', 'I reviewed inconsistent parent or breeding animal sex.':'I checked the sex of the parents and breeding animals.', 'I reviewed this notice and original records. This acknowledgment does not authorize slaughter or milk sale. Required for departures.':'I checked this notice and the old records. This does not permit slaughter or milk sale. Check this for departures.','Date precision':'How sure are you of the day?', 'DOB precision':'How sure are you of the birth date?', 'Estimated gestation days (pregnant only)':'How many days has she been in calf?', 'Existing course (same animal and product)':'Does this dose go with earlier doses?', 'I confirm the instructions explicitly specify zero':'I checked that the instructions say zero wait.', 'Final completed administration (must be latest)':'Which was the last dose?', 'Resolution reason, including how unknown timing was addressed':'How did you check the missing time?', 'Instructions / conditions (milk not applicable means no marketed milk)':'What are the full instructions? Milk does not apply only if no milk is sold.', 'Administration precision':'How much of the time do you know?', 'Administration date':'What day was it?',
 'Entered local date and time (timed records)':'What day and time was it?', 'Original time zone':'Farm clock',
 'UTC offset in minutes (local minus UTC; choose explicitly, e.g. -420 or -480)':'Which time was it?',
 'Product / vaccine':'What product did you give?', 'Dose (blank only with unknown explanation in notes)':'How much did you give?',
 'Dose unit':'What unit is on the bottle?', Route:'How did you give it?', 'Injection site':'Where did you give it?',
 Administrator:'Who gave it?', Reason:'Why did you give it?', 'Label or veterinarian instruction reference':'Which label or vet note did you use?',
 'Rule state (required; blank is not zero)':'What do the instructions say?', 'Entered interval':'How long is the wait?',
 'Interval unit':'Hours or days?', 'Instruction source':'Where are the instructions from?', 'Instruction reference':'Which label or vet note?',
 'Start an open course for each selected animal':'Keep this dose open for more doses later?',
 'Farm ID':'What do you call this animal?', 'Visual tag (text)':'What is on the ear tag?',
 'Notes (explain unknown source or destination)':'What else should you note?', 'Revision reason':'Why are you changing this?', 'Internal ID':'Record number'};
 return labels[text] || text.replace(/\s*\([^)]*\)/g,'').replace(/\brevision\b/gi,'change').replace(/\bdataset\b/gi,'herd').replace(/\bUTC\b/g,'world clock').replace(/\bISO\b/g,'full date and time').replace(/\bAdministrator\b/g,'Who gave it').replace(/\bVeterinarian\b/g,'Vet').replace(/\bDOB\b/g,'Birth date').replace(/\bADG\b/g,'Daily gain').replace(/\bDam\b/g,'Mother').replace(/\bSire\b/g,'Father');
}
export function entryError(control) {
 if(control.name==='enteredLocalTime')return 'Pick the day and time the dose was given, like today at 9 AM.';
 if(control.name==='offsetMinutes')return 'Choose the first or second time. Check the farm clock if this time did not happen.';
 if(control.name==='product') return 'Type the product name from the bottle, like LA-200.';
 return `Check your answer for ${plainLabel(control.labels?.[0]?.firstChild?.textContent || 'this field').replace(/\?$/,'')}. Add a value that fits.`;
}
// Run on farmer copy, excluding saved farmer text and the unchanged full terms.
export function copyProblems(text,{option=false,label=false}={}) {
 const problems=[];
 if(/\u2014/.test(text))problems.push('Use a full stop or comma.');
 if(/\b(?:UTC|ISO|DST|JSON|schema|dataset|revision|manifest|checksum|Internal ID)\b/.test(text))problems.push('Use plain words.');
 if(option&&/^[a-z]+(?:-[a-z]+)*$/.test(text))problems.push('Show words, not a code.');
 if(label&&/[()]/.test(text))problems.push('Keep the label simple.');
 for(const sentence of text.split(/[.!?]/).filter(Boolean))if((sentence.match(/\b[\w'-]+\b/g)||[]).length>20)problems.push('Split the long sentence.');
 const words=text.match(/[A-Za-z]+/g)||[];if(words.length>=8 && readingGrade(text)>6)problems.push('Use shorter, simpler words.');
 return problems;
}

// A rough reading check. Names and bottle text are farmer input, not app copy.
export function readingGrade(text){
 const words=text.match(/[A-Za-z]+/g)||[];if(!words.length)return 0;
 const syllables=words.reduce((sum,w)=>{w=w.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/,'').replace(/^y/,'');return sum+Math.max(1,(w.match(/[aeiouy]{1,2}/g)||[]).length);},0);
 const sentences=Math.max(1,text.split(/[.!?]+/).filter(s=>s.trim()).length);
 return 0.39*words.length/sentences+11.8*syllables/words.length-15.59;
}
export function plainReason(reason){
 const words={
  'device clock moved backward':'The phone clock went back',
  'course open or unresolved':'The series of doses is not marked done',
  'future administration':'The dose time is in the future',
  'course final dose is not latest':'The final dose is not the last saved dose',
  'prohibited use':'The instructions say do not use',
  'directed release evidence incomplete':'The vet check needs more proof',
  'directed release precedes administration':'The vet end time is before the dose',
  'duration or explicit zero confirmation missing':'The wait is missing, or zero wait was not checked',
  'administration time missing':'The dose time is missing',
  'interval outside supported range':'This wait is too large to count here',
  'non-time condition or unresolved instructions':'The full instructions still need a check',
  'unknown duration':'The wait is not known',
 };
 return words[reason] || reason;
}
