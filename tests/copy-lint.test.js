// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {copyProblems,readingGrade,plainLabel,plainOption,entryError} from '../app/lib/copy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('copy detector catches jargon, raw codes, long sentences, parenthetic labels and long dashes',()=>{
 for(const [text,options] of [['UTC offset in minutes',{}],['instant',{option:true}],['not-applicable',{option:true}],['Dose (required)',{label:true}],['a\u2014b',{}],[Array(22).fill('word').join(' '),{}]])assert.ok(copyProblems(text,options).length,text);
});
test('treatment option words and common field labels pass copy rules',()=>{
 for(const code of ['instant','date-only','duration','unknown','not-applicable','prohibited','manual-review','hours','days','label','vet','IM','SC','IV','oral','topical','intranasal','lb','kg','management-lot','ISO','MDY','DMY'])assert.deepEqual(copyProblems(plainOption(code),{option:true}),[],code);
 for(const label of ['Farm ID','Visual tag (text)','Administration precision','Administration date','Entered local date and time (timed records)','UTC offset in minutes (local minus UTC; choose explicitly, e.g. -420 or -480)','Rule state (required; blank is not zero)','Instructions / conditions (milk not applicable means no marketed milk)','Dose (blank only with unknown explanation in notes)'])assert.deepEqual(copyProblems(plainLabel(label),{label:true}),[],label);
 assert.deepEqual(copyProblems(entryError({name:'product'})),[]);
 assert.ok(readingGrade(entryError({name:'product'}))<=6);
 assert.ok(copyProblems('Comprehensive administrative authorization necessitates extraordinary regulatory verification procedures.').length);
});
test('new app source, tests and handoff use no long dash or native validation bubbles',()=>{
 for(const file of ['app/lib/copy.js','app/lib/when.js','app/lib/last-used.js','app/lib/guided-form.js','app/index.html','app/help.html'])assert.doesNotMatch(read(file),/\u2014/,file);
 assert.doesNotMatch(read('app/lib/guided-form.js'),/\.reportValidity\(/);
});
