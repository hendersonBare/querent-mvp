import type Database from 'better-sqlite3';
import {DANA,REPS,WASATCH,WASATCH_REP} from './accounts';
import {addDays,addMinutes,at,longDate,nextWeekday,shortDate} from './dates';
import {inserter,round2} from './insert';

// Sample quote Q-24817: Dana's request from the mockup, drafted by Querent and waiting
// for Brandi's review. seedSampleQuote() also backs "Reset sample quote": it deletes
// whatever the demo did to Q-24817 (lines, revisions, notes, activity, chat) and rebuilds it.

export const SAMPLE_QUOTE={id:'q-24817',number:'Q-24817',conversationId:'conv-q-24817'};
export const SAMPLE_REQUEST='Do you have the 1/2 in grade 8 hex bolts in stock? Need 10 boxes plus the usual cut-off wheels and gloves. Also need 2 in ratchet straps, maybe 12. Can we pick up Thursday at the SLC branch?';

type Basis='contract'|'customer'|'last_paid';
/** [sku, qty, Querent's basis, what Dana said, match score] */
const LINES:[string,number,Basis,string,number][]=[
  ['HCS-12-13-2G8',10,'last_paid','1/2 in grade 8 hex bolts, 10 boxes',0.92],
  ['CW-45-045-T1',6,'contract','the usual cut-off wheels',0.95],
  ['GLV-N8-L-1000',4,'last_paid','the usual gloves',0.93],
  ['RS-2-27-JH',12,'customer','2 in ratchet straps, maybe 12 (then: 27 ft with J-hooks)',0.9],
];

const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
const gp=(n:number)=>`${n<0?'-':'+'}${money(Math.abs(n))} GP vs customer price.`;

export function seedSampleQuote(database:Database.Database,anchor:string){
  const {id,number,conversationId}=SAMPLE_QUOTE;
  const one=<T>(sql:string,...params:unknown[])=>database.prepare(sql).get(...params) as T|undefined;
  const insert=inserter(database);
  database.transaction(()=>{
    database.prepare('UPDATE quotes SET duplicated_from=NULL WHERE duplicated_from=?').run(id);
    // Other quotes asked for in the same chat (or duplicated from Q-24817) outlive its conversation.
    database.prepare('UPDATE quotes SET conversation_id=NULL WHERE conversation_id=? AND id<>?').run(conversationId,id);
    database.prepare('UPDATE orders SET quote_id=NULL WHERE quote_id=?').run(id);
    for(const table of ['quote_lines','quote_revisions','quote_activity','quote_notes'])database.prepare(`DELETE FROM ${table} WHERE quote_id=?`).run(id);
    database.prepare('DELETE FROM quotes WHERE id=?').run(id);
    database.prepare('DELETE FROM messages WHERE conversation_id=?').run(conversationId);
    database.prepare('DELETE FROM conversations WHERE id=?').run(conversationId);

    const rep=REPS.find(r=>r.id===WASATCH_REP)!;
    const requestedAt=at(anchor,0,'16:14'),draftedAt=addMinutes(requestedAt,1),chatStart=addMinutes(requestedAt,-2);
    const slcBolts=one<{available:number}>("SELECT available FROM branch_stock WHERE item_id='HCS-12-13-2G8' AND branch_id='slc'")!.available;

    insert('conversations',{id:conversationId,customer_id:WASATCH.id,contact_id:DANA.id,started_at:chatStart});
    const messages:[number,string,string,string,unknown][]=[
      [0,'customer','text',SAMPLE_REQUEST,null],
      [0.25,'assistant','text',`Yes, the 1/2-13 x 2 in Grade 8 hex cap screws are in stock at SLC (${slcBolts} boxes). For the 2 in ratchet straps, do you want 27 ft with J-hooks or 30 ft with flat hooks?`,null],
      [1,'customer','text','27 ft with J-hooks.',null],
      [1.25,'assistant','item_popup','Here is your list. Check the quantities, choose pickup or delivery, then press Request quote.',{fulfillment:'will_call',branch_id:'slc',lines:LINES.map(([sku,qty])=>({sku,qty}))}],
      [2,'assistant','quote_requested',`Thanks, Dana. ${rep.name} is pricing your request now. Quote ${number} will arrive here in chat.`,{quote_id:id}],
    ];
    messages.forEach(([minutes,role,kind,content,payload],i)=>insert('messages',{id:`${conversationId}-${i+1}`,conversation_id:conversationId,role,kind,content,payload:payload===null?null:JSON.stringify(payload),created_at:addMinutes(chatStart,minutes)}));

    insert('quotes',{id,quote_number:number,customer_id:WASATCH.id,contact_id:DANA.id,rep_id:rep.id,status:'ready_for_review',revision:0,conversation_id:conversationId,request_text:SAMPLE_REQUEST,
      requested_at:requestedAt,created_at:draftedAt,updated_at:draftedAt,sent_at:null,responded_at:null,fulfillment:'will_call',branch_id:'slc',requested_date:nextWeekday(anchor,4),fulfillment_time:null,
      ship_to_address:`${WASATCH.ship_to_address}, ${WASATCH.ship_to_city}, ${WASATCH.ship_to_state} ${WASATCH.ship_to_zip}`,ship_to_lat:WASATCH.ship_to_lat,ship_to_lng:WASATCH.ship_to_lng,
      freight_override:null,freight_override_reason:null,valid_days:14,valid_until:null,customer_po:null,customer_note:null,change_request_note:null,unread_for_rep:1,unread_for_customer:0,is_sample:1,duplicated_from:null});

    LINES.forEach(([sku,qty,basis,requestedText,matchScore],i)=>{
      const cost=one<{cost:number}>('SELECT cost FROM items WHERE id=?',sku)!.cost;
      const customerPrice=one<{unit_price:number}>('SELECT p.unit_price FROM customer_prices p JOIN customers c ON c.price_level_id=p.price_level_id WHERE c.id=? AND p.item_id=?',WASATCH.id,sku)!.unit_price;
      let price=customerPrice,explanation=`Customer price. No purchase history or contract for this item. ${gp(0)}`;
      if(basis==='last_paid'){
        const last=one<{unit_price:number;order_date:string}>('SELECT l.unit_price,o.order_date FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.customer_id=? AND l.item_id=? AND o.order_date>=? ORDER BY o.order_date DESC LIMIT 1',WASATCH.id,sku,addDays(anchor,-365))!;
        price=last.unit_price;explanation=`Last paid ${money(price)} on ${shortDate(last.order_date)}, above customer price ${money(customerPrice)}. ${gp(round2((price-customerPrice)*qty))}`;
      }else if(basis==='contract'){
        const contract=one<{unit_price:number;contract_number:string;ends_on:string}>('SELECT l.unit_price,c.contract_number,c.ends_on FROM contract_lines l JOIN contracts c ON c.id=l.contract_id WHERE c.customer_id=? AND l.item_id=? AND c.starts_on<=? AND c.ends_on>=?',WASATCH.id,sku,anchor,anchor)!;
        price=contract.unit_price;explanation=`Contract price under ${contract.contract_number}, good through ${longDate(contract.ends_on)}. Contract prices are binding, so Querent doesn't raise them.`;
      }
      insert('quote_lines',{id:`${id}-${i+1}`,quote_id:id,line_no:i+1,item_id:sku,qty,unit_price:price,price_basis:basis,suggested_price:price,suggested_basis:basis,customer_price:customerPrice,unit_cost:cost,
        explanation,requested_text:requestedText,match_score:matchScore,added_by:'querent'});
    });

    const activity:[string,string,string|null,string,string][]=[
      [requestedAt,'customer',DANA.id,'requested','Dana asked for bolts, cut-off wheels, gloves and straps in Querent chat'],
      [requestedAt,'querent',null,'matched','Querent matched 4 items after 1 clarifying question'],
      [draftedAt,'querent',null,'drafted',`Draft quote built and sent to ${rep.name.split(' ')[0]} for review`],
    ];
    for(const [when,actor,actorId,kind,message] of activity)insert('quote_activity',{quote_id:id,at:when,actor,actor_id:actorId,kind,message});
  })();
}
