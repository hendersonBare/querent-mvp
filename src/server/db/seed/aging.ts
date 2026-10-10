import {DANA,REPS,SUPPLIER,WASATCH,WASATCH_REP,BRANCHES} from './accounts';
import {letterheadOf,repContactOf} from '../../quotes/snapshot';
import {addDays,addMinutes} from './dates';
import {catalogItem} from './catalog';
import {round2} from './insert';
import type {SeedContext} from './reference';

// Open Wasatch quotes for the aging demo (v3 spec §3, decision 39, OA-20; task A2). Unlike the rest
// of the seed, their times are relative to the reset time (`now`), not the anchor, so every reset
// shows the same mix whatever the seed date: one sent quote Aging (amber), one change request
// Overdue (red) and one fresh sent quote (ok). With the anchor pinned to the mockup's day, the
// sample Q-24817 is Overdue too. F1 completes the demo set (every status, more reps).
//
// Their numbers sit below the history's (Q-24793…) so Q-24817 stays the highest and the next
// request is still Q-24818. They are read (unread_for_rep 0), so the Quotes badge is unchanged, and
// each first send came 93 minutes after the request, the history's median time to send.

const H=3_600_000;
const SEND_MINUTES=93;
type Line=[sku:string,qty:number,price:number];
interface AgedQuote{number:number;status:'sent'|'changes_requested';sentHoursAgo:number;respondedHoursAgo?:number;note?:string;lines:Line[]}

export const AGED_QUOTES:readonly AgedQuote[]=[
  // Sent 4 days ago (100 h > 72 h): Aging.
  {number:24789,status:'sent',sentHoursAgo:100,lines:[['TL-55-BLK',6,33.50],['DEG-HD-4G',4,39.95]]},
  // Dana asked for changes 30 h ago (> 24 h): Overdue.
  {number:24790,status:'changes_requested',sentHoursAgo:54,respondedHoursAgo:30,note:'Can you hold the anchors for pickup at Ogden instead?',
    lines:[['ANC-12-414-W',40,25.95],['HCS-12-13-2G8',4,31.50]]},
  // Sent 20 h ago: fine, so the Needs attention filter has an open quote to leave out.
  {number:24791,status:'sent',sentHoursAgo:20,lines:[['DT-2-60',1,96.00]]},
];

export function seedAgingQuotes({insert}:SeedContext,now:string){
  const rep=REPS.find(r=>r.id===WASATCH_REP)!,branch=BRANCHES.find(b=>b.id==='slc')!;
  const ago=(hours:number)=>new Date(Date.parse(now)-hours*H).toISOString();
  for(const q of AGED_QUOTES){
    const id=`q-${q.number}`,quoteNumber=`Q-${q.number}`;
    const sentAt=ago(q.sentHoursAgo),requestedAt=addMinutes(sentAt,-SEND_MINUTES),createdAt=addMinutes(requestedAt,1);
    const respondedAt=q.respondedHoursAgo===undefined?null:ago(q.respondedHoursAgo);
    const validUntil=addDays(sentAt.slice(0,10),14);
    const lines=q.lines.map(([sku,qty,price])=>({item:catalogItem(sku),qty,price}));
    const subtotal=round2(lines.reduce((sum,l)=>sum+l.qty*l.price,0));
    insert('quotes',{id,quote_number:quoteNumber,customer_id:WASATCH.id,contact_id:DANA.id,rep_id:rep.id,status:q.status,revision:1,conversation_id:null,
      request_text:`Can you quote ${lines.map(l=>`${l.qty} x ${l.item.description}`).join(', ')}?`,
      requested_at:requestedAt,created_at:createdAt,updated_at:respondedAt??sentAt,sent_at:sentAt,responded_at:respondedAt,
      fulfillment:'will_call',branch_id:branch.id,requested_date:null,fulfillment_time:null,
      ship_to_address:`${WASATCH.ship_to_address}, ${WASATCH.ship_to_city}, ${WASATCH.ship_to_state} ${WASATCH.ship_to_zip}`,ship_to_lat:WASATCH.ship_to_lat,ship_to_lng:WASATCH.ship_to_lng,
      freight_override:null,freight_override_reason:null,valid_days:14,valid_until:validUntil,customer_po:null,customer_note:null,change_request_note:q.note??null,
      unread_for_rep:0,unread_for_customer:0,is_sample:0,duplicated_from:null});
    lines.forEach((l,i)=>insert('quote_lines',{id:`${id}-${i+1}`,quote_id:id,line_no:i+1,item_id:l.item.sku,qty:l.qty,unit_price:l.price,price_basis:'customer',
      suggested_price:l.price,suggested_basis:'customer',customer_price:l.price,unit_cost:l.item.cost,explanation:null,requested_text:null,match_score:null,added_by:'querent'}));
    const snapshot={quote_number:quoteNumber,revision:1,customer:{name:WASATCH.name,account_number:WASATCH.account_number},contact:DANA.name,rep:rep.name,
      fulfillment:'will_call',branch:branch.code,valid_until:validUntil,subtotal,freight:0,total:subtotal,ship_to:null,freight_miles:null,
      terms:WASATCH.terms,rep_contact:repContactOf(rep),letterhead:letterheadOf(SUPPLIER,{...branch,will_call_phone:branch.phone}),
      lines:lines.map(l=>({sku:l.item.sku,description:l.item.description,pack:l.item.pack,qty:l.qty,unit_price:l.price,total:round2(l.qty*l.price)}))};
    insert('quote_revisions',{id:`${id}-r1`,quote_id:id,revision:1,sent_at:sentAt,sent_by:rep.id,message:`Hi Dana, quote ${quoteNumber} is ready for you.`,attach_pdf:1,total:subtotal,snapshot:JSON.stringify(snapshot)});
    const activity:[string,string,string|null,string,string][]=[
      [requestedAt,'customer',DANA.id,'requested',`Dana asked for ${lines.length} ${lines.length===1?'item':'items'} in Querent chat`],
      [createdAt,'querent',null,'drafted',`Draft quote built and sent to ${rep.name.split(' ')[0]} for review`],
      [sentAt,'rep',rep.id,'sent',`${rep.name} sent ${quoteNumber} rev 1 to Dana (${subtotal.toLocaleString('en-US',{style:'currency',currency:'USD'})})`],
      ...(respondedAt?[[respondedAt,'customer',DANA.id,'changes_requested',`Dana requested changes to ${quoteNumber} rev 1: "${q.note}"`] as [string,string,string|null,string,string]]:[]),
    ];
    for(const [when,actor,actorId,kind,message] of activity)insert('quote_activity',{quote_id:id,at:when,actor,actor_id:actorId,kind,message});
  }
}
