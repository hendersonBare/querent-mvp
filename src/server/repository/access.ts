import 'server-only';
import {categories,type AccessRule,type Category} from '@/lib/contracts';
import {all,bool,flag,run} from './sql';

// Customer x information-category toggles (Settings > Customer access, spec §2). Chat tools
// check these server-side before answering.

export const isCategory=(value:string):value is Category=>(categories as readonly string[]).includes(value);

export interface AccessRow {category:Category;enabled:boolean;rep_id:string|null;rep_name:string|null;phone:string|null;email:string|null}

/** The customer's toggles, each with the customer's rep as the contact. */
export function access(customerId:string):AccessRow[]{
  return all<Omit<AccessRow,'enabled'>&{enabled:number}>('SELECT a.category,a.enabled,cr.rep_id,r.name rep_name,r.phone,r.email FROM access a LEFT JOIN customer_rep cr ON cr.customer_id=a.customer_id LEFT JOIN reps r ON r.id=cr.rep_id WHERE a.customer_id=? ORDER BY a.category',customerId)
    .map(row=>({...row,enabled:bool(row.enabled)}));
}

/** One rule per category across the customers: enabled is null when they differ. */
export function aggregateAccess(customerIds:string[]):AccessRule[]{
  const byCustomer=customerIds.map(access);
  return categories.map(category=>{
    const rows=byCustomer.map(rules=>rules.find(r=>r.category===category)!);
    const enabled=rows.every(r=>r.enabled)?true:rows.every(r=>!r.enabled)?false:null;
    const repIds=new Set(rows.map(r=>r.rep_id));const first=rows[0];const oneRep=repIds.size===1;
    return {category,enabled,rep_id:oneRep?first.rep_id:null,mixed_rep:!oneRep,rep_name:oneRep?first.rep_name||'Self-serve':'Multiple reps',phone:oneRep?first.phone:null,email:oneRep?first.email:null};
  });
}

/** Turns a category on or off for one customer, or for every customer when scope is null. */
export function setAccess(scope:string|null,category:Category,enabled:boolean){
  if(scope)run('UPDATE access SET enabled=? WHERE category=? AND customer_id=?',flag(enabled),category,scope);
  else run('UPDATE access SET enabled=? WHERE category=?',flag(enabled),category);
}

export function enabledCategories(customerId:string){return new Set(access(customerId).filter(r=>r.enabled).map(r=>r.category));}
