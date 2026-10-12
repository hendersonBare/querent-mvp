import 'server-only';
import type {AccountSummary,Contact,CustomerAccount,CustomerDirectoryRow,CustomerListItem,CustomerStats,Department,Rep,RepNotificationKey,RepPicture,RepProfile,RepRole,RepStanding,Supplier,TeamRep} from '@/domain';
import {all,bool,inTransaction,one,run} from './sql';

const REP='SELECT id,name,initials,title,phone,email FROM reps';

export function supplier(){return one<Supplier>('SELECT id,name,address,city,state,zip,phone,email,website FROM suppliers ORDER BY rowid LIMIT 1')!;}

export function customerIds(){return all<{id:string}>('SELECT id FROM customers ORDER BY name').map(c=>c.id);}
/** Every customer with its one rep: the customer picker, Customers list and Rep assignments. */
export function customers(){return all<CustomerListItem>('SELECT c.id,c.name,c.account_number,r.id rep_id,r.name rep_name FROM customers c LEFT JOIN customer_rep cr ON cr.customer_id=c.id LEFT JOIN reps r ON r.id=cr.rep_id ORDER BY c.name');}

/**
 * Internal: the rep's Customers list (task 3.8). Every customer by name with its rep, terms, balance
 * and order and quote counts; `repId` keeps only that rep's customers, and counts only their own quotes (task U1).
 * open_quote_count is the quotes still open (Draft ready, Changes requested, Sent: the Has open quotes filter, plan U5);
 * the caller stores lazy expiry first, so a sent quote past valid until no longer counts.
 */
export function customerDirectory({repId=null}:{repId?:string|null}={}){
  return all<CustomerDirectoryRow>(`SELECT c.id,c.name,c.account_number,r.id rep_id,r.name rep_name,c.terms,c.credit_limit,c.open_balance,
      (SELECT count(*) FROM orders o WHERE o.customer_id=c.id) order_count,(SELECT max(o.order_date) FROM orders o WHERE o.customer_id=c.id) last_order_date,
      (SELECT count(*) FROM quotes q WHERE q.customer_id=c.id AND (@repId IS NULL OR q.rep_id=@repId)) quote_count,
      (SELECT count(*) FROM quotes q WHERE q.customer_id=c.id AND (@repId IS NULL OR q.rep_id=@repId) AND q.status IN ('ready_for_review','changes_requested','sent')) open_quote_count
    FROM customers c LEFT JOIN customer_rep cr ON cr.customer_id=c.id LEFT JOIN reps r ON r.id=cr.rep_id WHERE (@repId IS NULL OR cr.rep_id=@repId) ORDER BY c.name`,{repId});
}

type CustomerRow=Omit<CustomerAccount,'ship_to'|'rep'>&{ship_to_name:string|null;ship_to_address:string|null;ship_to_city:string|null;ship_to_state:string|null;ship_to_zip:string|null;ship_to_lat:number|null;ship_to_lng:number|null};

/** Internal: the full account (terms, credit, tax, price level, ship-to, rep). */
export function customerAccount(customerId:string):CustomerAccount|undefined{
  const row=one<CustomerRow>('SELECT id,account_number,name,terms,credit_limit,open_balance,past_due_balance,tax_status,tax_state,price_level_id,main_phone,ship_to_name,ship_to_address,ship_to_city,ship_to_state,ship_to_zip,ship_to_lat,ship_to_lng FROM customers WHERE id=?',customerId);
  if(!row)return undefined;
  const {ship_to_name,ship_to_address,ship_to_city,ship_to_state,ship_to_zip,ship_to_lat,ship_to_lng,...account}=row;
  const ship_to=ship_to_address?{name:ship_to_name,address:ship_to_address,city:ship_to_city,state:ship_to_state,zip:ship_to_zip,lat:ship_to_lat,lng:ship_to_lng}:null;
  return {...account,ship_to,rep:assignedRep(customerId)??null};
}

/** Customer-safe account facts: terms, credit limit, balances, tax status and the rep. */
export function accountSummary(customerId:string):AccountSummary|undefined{
  const row=one<Omit<AccountSummary,'rep'>>('SELECT id customer_id,account_number,name,terms,credit_limit,open_balance,past_due_balance,tax_status FROM customers WHERE id=?',customerId);
  return row&&{...row,rep:assignedRep(customerId)??null};
}

/** Customer-safe: the ship-to on file as one line ("1800 W 10950 S, South Jordan, UT 84095"), or null. Delivery quotes go there (task 2.3). */
export function deliveryAddress(customerId:string):string|null{
  const row=one<{address:string|null;city:string|null;state:string|null;zip:string|null}>('SELECT ship_to_address address,ship_to_city city,ship_to_state state,ship_to_zip zip FROM customers WHERE id=?',customerId);
  if(!row?.address)return null;
  const place=[row.state,row.zip].filter(Boolean).join(' ');
  return [row.address,row.city,place].filter(Boolean).join(', ');
}

/** Internal: last order and quote win rate for the rep's Customer panel. */
export function customerStats(customerId:string):CustomerStats{
  const last=one<{order_number:string;order_date:string;total:number}>('SELECT order_number,order_date,total FROM orders WHERE customer_id=? ORDER BY order_date DESC,order_number DESC LIMIT 1',customerId);
  // Lost = expired or declined (A1), as quoteOutcome counts them.
  const counts=one<{accepted:number|null;lost:number|null}>("SELECT sum(status='accepted') accepted,sum(status IN ('expired','declined')) lost FROM quotes WHERE customer_id=?",customerId);
  const accepted=counts?.accepted??0,lost=counts?.lost??0;
  return {customer_id:customerId,last_order:last??null,quotes_accepted:accepted,quotes_lost:lost,win_rate:accepted+lost?accepted/(accepted+lost):null};
}

const CONTACT='SELECT id,customer_id,name,title,phone,email,is_primary FROM contacts';
const toContact=(row:Omit<Contact,'is_primary'>&{is_primary:number}):Contact=>({...row,is_primary:bool(row.is_primary)});
export function contacts(customerId:string){return all<Omit<Contact,'is_primary'>&{is_primary:number}>(`${CONTACT} WHERE customer_id=? ORDER BY is_primary DESC,name`,customerId).map(toContact);}
export function contact(contactId:string){const row=one<Omit<Contact,'is_primary'>&{is_primary:number}>(`${CONTACT} WHERE id=?`,contactId);return row&&toContact(row);}

/** Static department contacts for the customer sidebar (spec §3). */
export function departments(){return all<Department>('SELECT id,name,branch_id,phone,email,hours,sort_order FROM departments ORDER BY sort_order');}

/** Every rep by name; activeOnly leaves out inactive reps (the ones a customer can't be assigned to, task D1). */
export function reps({activeOnly=false}:{activeOnly?:boolean}={}){return all<Rep>(`${REP}${activeOnly?' WHERE active=1':''} ORDER BY name`);}
export function rep(repId:string){return one<Rep>(`${REP} WHERE id=?`,repId);}
/** The customer's one assigned rep (customer_rep). A quote's rep is always this rep (spec §5.2). */
export function assignedRep(customerId:string){return one<Rep>(`${REP} WHERE id=(SELECT rep_id FROM customer_rep WHERE customer_id=?)`,customerId);}

/**
 * Assigns the customer's one rep (Settings > Rep assignments). Existing quotes keep their rep:
 * quotes are never reassigned (spec §4). Returns false if the customer doesn't exist, or the rep
 * doesn't exist or is inactive (an inactive rep has no customers, task D1).
 */
export function setAssignedRep(customerId:string,repId:string){
  if(!one('SELECT 1 FROM customers WHERE id=?',customerId))return false;
  // The active check is in the statement itself, so a rep deactivated meanwhile can't gain a customer.
  return run(`INSERT INTO customer_rep(customer_id,rep_id) SELECT ?,id FROM reps WHERE id=? AND active=1
    ON CONFLICT(customer_id) DO UPDATE SET rep_id=excluded.rep_id`,customerId,repId).changes>0;
}

// ---- Roles, teams and inactive reps (v3 spec §1.2 "006" row, §8; decisions 20, 21; tasks D1, U7) ----

/** The rep's stored role and active flag: every rep request checks it (src/server/rep/access.ts). Undefined for an unknown rep. */
export function repStanding(repId:string):RepStanding|undefined{
  const row=one<{role:RepRole;active:number}>('SELECT role,active FROM reps WHERE id=?',repId);
  return row&&{role:row.role,active:bool(row.active)};
}

/**
 * Every rep by name with role, team, active flag and customer count (Teams and Reps, Analytics' filter).
 * The team is the rep's team entity (011_teams, plan U7): its name and id, null for a rep in none.
 */
export function teamReps():TeamRep[]{
  return all<Omit<TeamRep,'active'>&{active:number}>(`SELECT r.id,r.name,r.initials,r.title,r.role,t.name team,t.id team_id,r.active,
      (SELECT count(*) FROM customer_rep cr WHERE cr.rep_id=r.id) customer_count
    FROM reps r LEFT JOIN team_members m ON m.rep_id=r.id LEFT JOIN teams t ON t.id=m.team_id ORDER BY r.name`).map(row=>({...row,active:bool(row.active)}));
}

/**
 * Marks the rep active or inactive. Deactivation is refused while any customer has the rep in
 * customer_rep (decision 21): checked in the same statement, so a customer assigned meanwhile still blocks it.
 */
export function setRepActive(repId:string,active:boolean):'ok'|'not_found'|'has_customers'{
  if(!one('SELECT 1 FROM reps WHERE id=?',repId))return 'not_found';
  const changed=active
    ?run('UPDATE reps SET active=1 WHERE id=?',repId).changes
    :run('UPDATE reps SET active=0 WHERE id=? AND NOT EXISTS(SELECT 1 FROM customer_rep WHERE rep_id=?)',repId,repId).changes;
  return changed?'ok':'has_customers';
}

// ---- A rep's own Settings > Profile and Notifications (plan U9; 013_rep_profile; Appendix C) ----
// Each function takes the rep whose row it reads or writes; the routes pass the signed-in rep only.

const PROFILE='SELECT id,name,initials,title,phone,email,picture_updated_at FROM reps';

/** The rep's name, initials, title, phone and email, and when their picture last changed (null: none). */
export function repProfile(repId:string){return one<RepProfile>(`${PROFILE} WHERE id=?`,repId);}

/** Customer-safe: the customer's assigned rep as the My rep sheet shows them (no picture bytes). */
export function assignedRepProfile(customerId:string){return one<RepProfile>(`${PROFILE} WHERE id=(SELECT rep_id FROM customer_rep WHERE customer_id=?)`,customerId);}

/** Stores the rep's name, initials, phone and email (already checked by the caller). Undefined for an unknown rep. */
export function setRepProfile(repId:string,{name,initials,phone,email}:{name:string;initials:string;phone:string;email:string}){
  run('UPDATE reps SET name=?,initials=?,phone=?,email=? WHERE id=?',name,initials,phone,email,repId);
  return repProfile(repId);
}

/** The rep's picture: its bytes, its type and when it changed. Undefined when they have none. */
export function repPicture(repId:string){
  return one<RepPicture>('SELECT picture data,picture_type type,picture_updated_at updated_at FROM reps WHERE id=? AND picture IS NOT NULL',repId);
}

/** Customer-safe: the picture of the customer's own assigned rep, for the My rep sheet. Undefined when there is none. */
export function assignedRepPicture(customerId:string){
  return one<RepPicture>('SELECT picture data,picture_type type,picture_updated_at updated_at FROM reps WHERE id=(SELECT rep_id FROM customer_rep WHERE customer_id=?) AND picture IS NOT NULL',customerId);
}

/** Replaces the rep's picture (type already checked by its bytes), or clears it with null. False for an unknown rep. */
export function setRepPicture(repId:string,picture:{type:RepPicture['type'];data:Uint8Array;at:string}|null){
  const changes=picture
    ?run('UPDATE reps SET picture=?,picture_type=?,picture_updated_at=? WHERE id=?',Buffer.from(picture.data),picture.type,picture.at,repId).changes
    :run('UPDATE reps SET picture=NULL,picture_type=NULL,picture_updated_at=NULL WHERE id=?',repId).changes;
  return changes>0;
}

/** The rep's stored in-app choices by event key. A key with no row is on (the caller fills it in). */
export function repNotificationPrefs(repId:string):Partial<Record<RepNotificationKey,boolean>>{
  return Object.fromEntries(all<{event_key:RepNotificationKey;in_app:number}>('SELECT event_key,in_app FROM rep_notification_prefs WHERE rep_id=? ORDER BY rowid',repId).map(r=>[r.event_key,bool(r.in_app)]));
}

/** Stores the choices given (keys already checked by the caller), all together, and returns every stored choice. */
export function setRepNotificationPrefs(repId:string,prefs:Partial<Record<RepNotificationKey,boolean>>){
  inTransaction(()=>{
    for(const [key,on] of Object.entries(prefs))run('INSERT INTO rep_notification_prefs(rep_id,event_key,in_app) VALUES(?,?,?) ON CONFLICT(rep_id,event_key) DO UPDATE SET in_app=excluded.in_app',repId,key,on?1:0);
  });
  return repNotificationPrefs(repId);
}
