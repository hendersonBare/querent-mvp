import 'server-only';
import type {CustomerListItem} from '@/domain';
import type {Principal} from '@/lib/contracts';
import {customers,repStanding} from '@/server/repository';

// Who the rep portal serves (v3 spec §5, §8; decisions 20, 21; OA-12; task D1). The demo cookie
// names a persona (src/server/session.ts); the rep it names must also exist and be active in the
// database, so a rep marked inactive loses access at once, cookie or not. Manager features need
// the persona's rep_role and the stored reps.role to both say manager.

/** The signed-in rep, or why not: 401 without a session, 403 for a customer or an inactive rep. */
export type RepAccess={ok:true;repId:string;manager:boolean}|{ok:false;status:401|403;detail:string};

export function repAccess(user:Principal|null):RepAccess{
  if(!user)return {ok:false,status:401,detail:'Choose a demo workspace.'};
  if(user.role!=='supplier_admin'||!user.rep_id)return {ok:false,status:403,detail:'Supplier access required.'};
  const standing=repStanding(user.rep_id);
  if(!standing)return {ok:false,status:403,detail:'Supplier access required.'};
  if(!standing.active)return {ok:false,status:403,detail:'This rep account is inactive.'};
  return {ok:true,repId:user.rep_id,manager:user.rep_role==='manager'&&standing.role==='manager'};
}

// ---- What a signed-in rep may read (Appendix B; decisions 20, 22, 42; task U1) ----
//
// Scope is purely role based: a rep reads only their own customers (customer_rep) and their own
// quotes (quotes.rep_id, the current owner); the manager reads the whole organization. No request
// parameter widens it: ?scope=all is gone, and ?customer= is a page's own filter that only narrows.
// Writes are unchanged: the manager still edits only her own quotes and opens other reps' quotes
// read-only until she reassigns them (decision 22; ./quotes readableQuote, repQuote).
// TODO(R-12): hierarchical visibility (a manager's subtree) and named groups, with real auth.

/** Who is reading: the signed-in rep's id and whether they are the manager (repAccess). */
export type RepReader=Pick<Extract<RepAccess,{ok:true}>,'repId'|'manager'>;

/** Whose book limits a read: the rep's own id, or null for the manager (every rep). */
export const ownerFilter=(reader:RepReader):string|null=>reader.manager?null:reader.repId;

/** The customers the reader may read, by name: a rep's own, or every customer for the manager. */
export function readableCustomers(reader:RepReader,everyone:readonly CustomerListItem[]=customers()):CustomerListItem[]{
  return everyone.filter(c=>reader.manager||c.rep_id===reader.repId);
}

/** Whether the reader may read this customer (and its orders). */
export const readsCustomer=(reader:RepReader,customerId:string,everyone?:readonly CustomerListItem[])=>readableCustomers(reader,everyone).some(c=>c.id===customerId);

/** A page's ?customer= filter, kept only when the reader may read that customer; anything else reads as every customer. */
export function customerFilterFor(reader:RepReader,customerId:string|null|undefined,everyone?:readonly CustomerListItem[]):CustomerListItem|null{
  if(!customerId)return null;
  return readableCustomers(reader,everyone).find(c=>c.id===customerId)??null;
}
