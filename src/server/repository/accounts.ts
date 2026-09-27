import 'server-only';
import type {AccountSummary,Contact,CustomerAccount,CustomerDirectoryRow,CustomerListItem,CustomerStats,Department,Rep,Supplier} from '@/domain';
import {all,bool,one,run} from './sql';

const REP='SELECT id,name,initials,title,phone,email FROM reps';

export function supplier(){return one<Supplier>('SELECT id,name,address,city,state,zip,phone,email,website FROM suppliers ORDER BY rowid LIMIT 1')!;}

export function customerIds(){return all<{id:string}>('SELECT id FROM customers ORDER BY name').map(c=>c.id);}
/** Every customer with its one rep: the customer picker, Customers list and Rep assignments. */
export function customers(){return all<CustomerListItem>('SELECT c.id,c.name,c.account_number,r.id rep_id,r.name rep_name FROM customers c LEFT JOIN customer_rep cr ON cr.customer_id=c.id LEFT JOIN reps r ON r.id=cr.rep_id ORDER BY c.name');}

/** Internal: the rep's Customers list (task 3.8). Every customer by name with its rep, terms, balance and order and quote counts. */
export function customerDirectory(){
  return all<CustomerDirectoryRow>(`SELECT c.id,c.name,c.account_number,r.id rep_id,r.name rep_name,c.terms,c.credit_limit,c.open_balance,
      (SELECT count(*) FROM orders o WHERE o.customer_id=c.id) order_count,(SELECT max(o.order_date) FROM orders o WHERE o.customer_id=c.id) last_order_date,
      (SELECT count(*) FROM quotes q WHERE q.customer_id=c.id) quote_count
    FROM customers c LEFT JOIN customer_rep cr ON cr.customer_id=c.id LEFT JOIN reps r ON r.id=cr.rep_id ORDER BY c.name`);
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
  const counts=one<{accepted:number|null;expired:number|null}>("SELECT sum(status='accepted') accepted,sum(status='expired') expired FROM quotes WHERE customer_id=?",customerId);
  const accepted=counts?.accepted??0,expired=counts?.expired??0;
  return {customer_id:customerId,last_order:last??null,quotes_accepted:accepted,quotes_expired:expired,win_rate:accepted+expired?accepted/(accepted+expired):null};
}

const CONTACT='SELECT id,customer_id,name,title,phone,email,is_primary FROM contacts';
const toContact=(row:Omit<Contact,'is_primary'>&{is_primary:number}):Contact=>({...row,is_primary:bool(row.is_primary)});
export function contacts(customerId:string){return all<Omit<Contact,'is_primary'>&{is_primary:number}>(`${CONTACT} WHERE customer_id=? ORDER BY is_primary DESC,name`,customerId).map(toContact);}
export function contact(contactId:string){const row=one<Omit<Contact,'is_primary'>&{is_primary:number}>(`${CONTACT} WHERE id=?`,contactId);return row&&toContact(row);}

/** Static department contacts for the customer sidebar (spec §3). */
export function departments(){return all<Department>('SELECT id,name,branch_id,phone,email,hours,sort_order FROM departments ORDER BY sort_order');}

export function reps(){return all<Rep>(`${REP} ORDER BY name`);}
export function rep(repId:string){return one<Rep>(`${REP} WHERE id=?`,repId);}
/** The customer's one assigned rep (customer_rep). A quote's rep is always this rep (spec §5.2). */
export function assignedRep(customerId:string){return one<Rep>(`${REP} WHERE id=(SELECT rep_id FROM customer_rep WHERE customer_id=?)`,customerId);}

/**
 * Assigns the customer's one rep (Settings > Rep assignments). Existing quotes keep their rep:
 * quotes are never reassigned (spec §4). Returns false if the customer or rep doesn't exist.
 */
export function setAssignedRep(customerId:string,repId:string){
  if(!rep(repId)||!one('SELECT 1 FROM customers WHERE id=?',customerId))return false;
  run('INSERT INTO customer_rep(customer_id,rep_id) VALUES(?,?) ON CONFLICT(customer_id) DO UPDATE SET rep_id=excluded.rep_id',customerId,repId);
  return true;
}
