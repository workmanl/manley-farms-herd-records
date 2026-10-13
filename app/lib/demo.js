// SPDX-License-Identifier: AGPL-3.0-only
import { openRepository } from './database.js';
import { commitWorkflow, farmDate } from './workflows.js';
export const DEMO_DATABASE='manley_herd_records_demo';
export async function openDemo(factory=globalThis.indexedDB, now=new Date()){
 const repo=await openRepository({factory,name:DEMO_DATABASE});
 const s=await repo.snapshot();
 const legacy=s.animals.length===3&&['Demo 214','Demo 215','Demo 301'].every(id=>s.animals.some(a=>a.farmId===id));
 if(!s.animals.length||legacy){
  const save=async(action,input)=>commitWorkflow(repo,await repo.snapshot(),action,input);
  const date=days=>farmDate('Etc/UTC',new Date(now.getTime()+days*86400000));
  const groups=[];
  for(const name of ['North pasture','South pasture','Home paddock'])groups.push(await save('group',{name,type:'pasture',description:'DEMO: practice group.'}));
  const animals=[];
  const herd=[['Daisy 214','female'],['Rosie 215','female'],['Buttercup 216','female'],['Clover 217','female'],['Bessie 218','female'],['Bull Hank 300','male'],['Steer 330','steer'],['Steer 331','steer'],['Steer 332','steer'],['Heifer 410','female'],['Heifer 411','female'],['Heifer 412','female'],['Heifer 413','female'],['Steer 333','steer']];
  for(const [i,[farmId,sex]] of herd.entries())animals.push(await save('animal',{...(legacy&&[0,1,6].includes(i)?{id:s.animals.find(a=>a.farmId===({0:'Demo 214',1:'Demo 215',6:'Demo 301'})[i]).id,revisionReason:'Upgrade DEMO sample herd'}:{}),farmId,visualTag:farmId.split(' ').at(-1),sex,currentGroupId:groups[i>=6&&i<12?1:i%3].id,pasture:groups[i>=6&&i<12?1:i%3].name,effectiveDate:date(-90),notes:'DEMO: practice cattle only.'}));
  for(let i=0;i<4;i++)await save('calving',{damId:animals[i].id,birthDate:date(-Math.min(30+i*15,Math.floor((now-new Date(`${date(0).slice(0,4)}-01-01T00:00:00Z`))/86400000))),dateConfirmed:true,easeScore:1,calves:[{farmId:['Poppy 501','Pip 502','Sunny 503','Fern 504'][i],visualTag:String(501+i),sex:i%2?'male':'female',weight:75+i*3,unit:'lb',currentGroupId:groups[i%3].id,pasture:groups[i%3].name}],notes:'DEMO: sample birth.'});
  for(const i of [1,6,7])for(const [days,value]of [[-60,1000],[-1,1140]])await save('weight',{animalId:animals[i].id,date:date(days),type:'other',value,unit:'lb',notes:'DEMO: sample weight.'});
  const breeding=await save('breeding',{animalId:animals[4].id,method:'natural',serviceDate:date(-55),sireId:animals[5].id,notes:'DEMO: sample breeding.'});
  await save('pregnancy',{animalId:animals[4].id,breedingId:breeding.id,date:date(-2),method:'ultrasound',result:'pregnant',notes:'DEMO: sample pregnancy check.'});
  await save('move',{animalIds:animals.slice(6,12).map(a=>a.id),date:date(-1),groupId:groups[0].id,pasture:groups[0].name});
  await save('movement',{animalId:animals[11].id,type:'sale',date:date(-1),destination:'DEMO: sample buyer',acknowledgeDeparture:true,notes:'DEMO: sample sale.'});
  const rule=(state,value=null)=>({state,value,unit:value===null?null:'days',source:'label',instructionReference:'DEMO ONLY: invented practice instructions, never use for real cattle.',instructionText:'DEMO ONLY: sample disposition.',zeroConfirmedAt:null,directedReleaseAt:null,resolutionReason:null,resolvedAt:null,resolvedBy:null});
  for(const [i,commodity,missing]of [[6,'meat',false],[2,'milk',false],[8,'meat',true]])await save('treatment',{animalId:animals[i].id,product:'DEMO ONLY: sample treatment',administrationPrecision:missing?'date-only':'instant',administrationDate:date(-1),enteredLocalTime:date(-1)+'T12:00:00',timeZone:'Etc/UTC',offsetMinutes:0,doseValue:2,doseUnit:'mL',route:'SC',injectionSite:'Neck',reason:'DEMO: practice treatment',administrator:'DEMO operator',instructionReference:'DEMO ONLY',notes:i===2?'DEMO: family milk cow. Practice instructions only.':'DEMO: practice instructions only.',meat:commodity==='meat'?rule('duration',8):rule('not-applicable'),milk:commodity==='milk'?rule('duration',4):rule('not-applicable')});
 }
 return repo;
}
export function deleteDemo(factory=globalThis.indexedDB){return new Promise((resolve,reject)=>{const request=factory.deleteDatabase(DEMO_DATABASE);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Close other demo tabs, then delete the demo again.'));});}
