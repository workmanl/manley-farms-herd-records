// SPDX-License-Identifier: AGPL-3.0-only
export const STORE_WORDS = {operation:'Farm settings', animals:'Animals', identifiers:'Tags', groups:'Groups', memberships:'Group moves', calvings:'Births', weights:'Weights', treatmentCourses:'Treatment courses', treatments:'Treatments', breedings:'Breedings', pregnancyChecks:'Pregnancy checks', movements:'Sales and moves', revisions:'Change history', metadata:'App settings'};
const words={farmId:'Farm name or number', visualTag:'Ear tag', rfid:'Electronic tag', damId:'Mother', sireId:'Father', currentGroupId:'Current group', animalId:'Animal', revision:'Change number', updatedAt:'Last changed', createdAt:'First saved', voidedAt:'Marked wrong', archivedAt:'Archived', datasetId:'Herd copy', schemaVersion:'File version', administrationAt:'Treatment time', notApplicable:'Does not apply'};
export function recordLines(record, snapshots = []) {
  const refs = new Map(snapshots.flatMap(s => Object.values(s).filter(Array.isArray).flat().filter(r=>r.id).map(r=>[r.id,r.visualTag || r.farmId || r.name || 'Linked record'])));
  const lines=[];
  function visit(value,path) {
    if(value && typeof value==='object') {for(const [k,v] of Object.entries(value)) {
      if(['id','farmIdKey','singletonKey','integrity'].includes(k)) continue;
      visit(v,path ? path+' / '+label(k) : label(k));
    }} else {
      let text=value===null?'Not set':String(value);
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text)) text=refs.get(text)||'Linked record from the copy';
      else if(/^\d{4}-\d{2}-\d{2}T/.test(text)) text=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(text));
      else if(/^[a-z]+(-[a-z]+)+$/.test(text)) text=text.replaceAll('-',' ');
      lines.push(path+': '+text);
    }
  }
  visit(record,'');return lines.join('\n');
}
function label(key) {return words[key] || key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());}
