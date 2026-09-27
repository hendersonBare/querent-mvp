import type Database from 'better-sqlite3';
import type {ContractPrice,LastPaid,PriceSources} from '@/domain';
import {priceLine} from '../../pricing';
import {DANA,REPS,WASATCH,WASATCH_REP} from './accounts';
import {addMinutes,addMonths,at,nextWeekday} from './dates';
import {inserter} from './insert';

// Sample quote Q-24817: Dana's request from the mockup, drafted by Querent and waiting
// for Brandi's review. seedSampleQuote() also backs "Reset sample quote": it deletes
// whatever the demo did to Q-24817 (lines, revisions, notes, activity, chat) and rebuilds it.

export const SAMPLE_QUOTE={id:'q-24817',number:'Q-24817',conversationId:'conv-q-24817'};
export const SAMPLE_REQUEST='Do you have the 1/2 in grade 8 hex bolts in stock? Need 10 boxes plus the usual cut-off wheels and gloves. Also need 2 in ratchet straps, maybe 12. Can we pick up Thursday at the SLC branch?';

/**
 * [sku, qty, what Dana said, match score]. Querent prices each line with the pricing engine
 * (spec §5.1): last paid on bolts and gloves, the contract on wheels, customer price on straps.
 */
const LINES:[string,number,string,number][]=[
  ['HCS-12-13-2G8',10,'1/2 in grade 8 hex bolts, 10 boxes',0.92],
  ['CW-45-045-T1',6,'the usual cut-off wheels',0.95],
  ['GLV-N8-L-1000',4,'the usual gloves',0.93],
  ['RS-2-27-JH',12,'2 in ratchet straps, maybe 12 (then: 27 ft with J-hooks)',0.9],
];

export function seedSampleQuote(database:Database.Database,anchor:string){
  const {id,number,conversationId}=SAMPLE_QUOTE;
  const one=<T>(sql:string,...params:unknown[])=>database.prepare(sql).get(...params) as T|undefined;
  const insert=inserter(database);
  database.transaction(()=>{
    database.prepare('UPDATE quotes SET duplicated_from=NULL WHERE duplicated_from=?').run(id);
    // Other quotes asked for in the same chat (or duplicated from Q-24817) outlive its conversation.
    database.prepare('UPDATE quotes SET conversation_id=NULL WHERE conversation_id=? AND id<>?').run(conversationId,id);
    database.prepare('UPDATE orders SET quote_id=NULL WHERE quote_id=?').run(id);
    for(const table of ['quote_lines','quote_removed_lines','quote_revisions','quote_activity','quote_notes'])database.prepare(`DELETE FROM ${table} WHERE quote_id=?`).run(id);
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

    // The facts the repository's priceSources returns, read on this raw connection (the seed can't use the repository).
    const priceFacts=(sku:string):PriceSources=>{
      const item=one<{sku:string;list_price:number;cost:number;case_qty:number;category_id:string}>('SELECT sku,list_price,cost,case_qty,category_id FROM items WHERE id=?',sku)!;
      const customerPrice=one<{unit_price:number}>('SELECT p.unit_price FROM customer_prices p JOIN customers c ON c.price_level_id=p.price_level_id WHERE c.id=? AND p.item_id=?',WASATCH.id,sku)?.unit_price??null;
      const contract=one<ContractPrice>(`SELECT c.id contract_id,c.contract_number,c.name contract_name,l.unit_price,c.starts_on,c.ends_on FROM contract_lines l JOIN contracts c ON c.id=l.contract_id
        WHERE c.customer_id=? AND l.item_id=? AND c.starts_on<=? AND c.ends_on>=? ORDER BY l.unit_price,c.starts_on DESC LIMIT 1`,WASATCH.id,sku,anchor,anchor)??null;
      const lastPaid=one<LastPaid>(`SELECT l.unit_price,l.qty,o.order_date,o.order_number FROM order_lines l JOIN orders o ON o.id=l.order_id
        WHERE o.customer_id=? AND l.item_id=? AND o.order_date>=? AND o.order_date<=? ORDER BY o.order_date DESC,o.order_number DESC,l.line_no LIMIT 1`,WASATCH.id,sku,addMonths(anchor,-12),anchor)??null;
      return {item_id:sku,...item,customer_price:customerPrice,contract,last_paid:lastPaid};
    };

    LINES.forEach(([sku,qty,requestedText,matchScore],i)=>{
      const sources=priceFacts(sku);
      // Scarcity is off in the seeded settings, so Reset sample quote always restores the mockup's prices.
      const {suggestion,explanation}=priceLine({sources,qty,branchId:'slc',stock:null,scarcityEnabled:false,floor:null,on:anchor});
      insert('quote_lines',{id:`${id}-${i+1}`,quote_id:id,line_no:i+1,item_id:sku,qty,unit_price:suggestion.price,price_basis:suggestion.basis,suggested_price:suggestion.price,suggested_basis:suggestion.basis,
        customer_price:suggestion.customerPrice,unit_cost:sources.cost,explanation,requested_text:requestedText,match_score:matchScore,added_by:'querent'});
    });

    const activity:[string,string,string|null,string,string][]=[
      [requestedAt,'customer',DANA.id,'requested','Dana asked for bolts, cut-off wheels, gloves and straps in Querent chat'],
      [requestedAt,'querent',null,'matched','Querent matched 4 items after 1 clarifying question'],
      [draftedAt,'querent',null,'drafted',`Draft quote built and sent to ${rep.name.split(' ')[0]} for review`],
    ];
    for(const [when,actor,actorId,kind,message] of activity)insert('quote_activity',{quote_id:id,at:when,actor,actor_id:actorId,kind,message});
  })();
}
