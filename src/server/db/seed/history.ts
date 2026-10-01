import {BRANCHES,type BranchId,CONTACT,CUSTOMER,CUSTOMER_REP,DELIVERY_RATES,REPS,SUPPLIER,TAX_RATE} from './accounts';
import {letterheadOf,repContactOf} from '../../quotes/snapshot';
import {catalogItem} from './catalog';
import {addDays,addMinutes,at} from './dates';
import {haversineRoadMiles} from '../../freight/distance';
import {CALL_FOR_FREIGHT,priceDelivery} from '../../freight/engine';
import {erp,round2} from './insert';
import type {SeedContext} from './reference';

// Twelve months of Timpanogos Fulfillment history, oldest first. Days are offsets from the anchor.
// It carries the facts Q-24817 prices on: last paid $48.75 on 2 in acrylic tape (day -42), $69.95
// contract cast stretch wrap and $172.00 4x6 labels on the last order (day -14), 12x9x6 boxes bought
// with the tape, flat poly mailers bought with the labels, #2 poly bubble mailers once at customer price, and
// 17 of 24 quotes won (71%). Every won quote became exactly one order. Everything is at Spanish Fork.

type Basis='contract'|'customer'|'list'|'last_paid'|'custom';
/** [sku, qty, unit price (default the customer price), basis (default customer), customer price at the time (default the item's)] */
type Line=[sku:string,qty:number,price?:number|null,basis?:Basis,customerPrice?:number];
interface Deal{day:number;quote?:number;outcome?:'accepted'|'expired';sendMinutes?:number;fulfillment:'will_call'|'delivery';branch:BranchId;lines:Line[]}
const BRANCH:BranchId='spanish-fork';
const won=(day:number,quote:number,sendMinutes:number,fulfillment:Deal['fulfillment'],lines:Line[]):Deal=>({day,quote,outcome:'accepted',sendMinutes,fulfillment,branch:BRANCH,lines});
const lost=(day:number,quote:number,sendMinutes:number,fulfillment:Deal['fulfillment'],lines:Line[]):Deal=>({day,quote,outcome:'expired',sendMinutes,fulfillment,branch:BRANCH,lines});
const order=(day:number,fulfillment:Deal['fulfillment'],lines:Line[]):Deal=>({day,fulfillment,branch:BRANCH,lines});

// SKUs (boxtpackaging.com): T902170 2 in acrylic tape, T905170 3 in acrylic tape, TDWH2 tape gun,
// SF188CAST cast hand wrap (2026 contract $69.95), MSF2080B machine wrap, PS1217 hand strapping,
// THL576 4x6 fanfold labels (2025 contract $158.00), THD114 4x6 desktop labels, DL1082 fragile labels,
// 1296-BDL 12x9x6 boxes (by the box), B873 #3 flat poly mailers, B831 #0 poly bubble mailers,
// B872 #2 flat poly mailers, B855SS #2 kraft bubble mailers, PB3679 14x14 zip bags, KP4850 kraft
// paper roll, EP3372160BX edge protectors.
const CAST=74.5,LABELS=164.5,TAPE=46.95;
export const DEALS:Deal[]=[
  won(-358,24793,95,'will_call',[['T902170',20],['SF188CAST',8,CAST],['TDWH2',4]]),
  won(-340,24794,140,'delivery',[['1296-BDL',500],['T902170',12]]),
  order(-330,'will_call',[['THL576',6,158,'contract',LABELS],['B873',4]]),
  lost(-322,24795,55,'delivery',[['PS1217',6],['EP3372160BX',4]]),
  won(-310,24796,210,'delivery',[['T902170',24],['SF188CAST',10,CAST],['1296-BDL',750],['TDWH2',6]]),
  order(-296,'will_call',[['THL576',4,158,'contract',LABELS],['B831',6]]),
  won(-270,24797,75,'delivery',[['THL576',8,158,'contract',LABELS],['B873',6],['DL1082',4]]),
  lost(-262,24798,180,'will_call',[['KP4850',6],['PS1217',4]]),
  won(-252,24799,48,'will_call',[['T902170',20],['SF188CAST',8,69.95,'contract',CAST],['1296-BDL',500]]),
  order(-240,'delivery',[['1296-BDL',1000],['T905170',8]]),
  won(-232,24800,120,'will_call',[['THL576',6],['B873',4]]),
  lost(-218,24801,260,'will_call',[['PB3679',4],['B855SS',6]]),
  won(-205,24802,65,'delivery',[['SF188CAST',12,69.95,'contract',CAST],['T902170',24],['1296-BDL',750]]),
  order(-190,'will_call',[['DL1082',6],['TDWH2',4]]),
  won(-170,24803,150,'delivery',[['1296-BDL',1000],['T902170',20]]),
  lost(-162,24804,95,'will_call',[['THD114',4],['B872',2]]),
  won(-155,24805,40,'will_call',[['T902170',24,47.95,'custom',TAPE],['SF188CAST',10,69.95,'contract',CAST],['TDWH2',4]]),
  won(-141,24806,85,'will_call',[['THL576',6,168,'custom',LABELS],['B831',8]]),
  order(-128,'delivery',[['EP3372160BX',6],['PS1217',8],['MSF2080B',4,106,'contract']]),
  won(-113,24807,130,'will_call',[['KP4850',6],['B873',4]]),
  won(-97,24808,55,'delivery',[['SF188CAST',10,69.95,'contract',CAST],['T902170',24,47.95,'last_paid',TAPE]]),
  won(-84,24809,175,'will_call',[['THL576',8,168,'last_paid',LABELS],['DL1082',4],['B831',6]]),
  lost(-77,24810,220,'delivery',[['MSF2080B',8,106,'contract'],['PS1217',10]]),
  order(-70,'will_call',[['B873',6],['TDWH2',6],['B833',4]]),
  won(-56,24811,70,'delivery',[['1296-BDL',1500],['T902170',30,47.95,'last_paid',TAPE]]),
  won(-42,24812,35,'will_call',[['T902170',20,48.75,'custom',TAPE],['SF188CAST',8,69.95,'contract',CAST],['TDWH2',2]]),
  lost(-35,24813,160,'will_call',[['PB3679',4],['B855SS',6]]),
  won(-28,24814,90,'delivery',[['1296-BDL',1000],['KP4850',4]]),
  lost(-21,24815,45,'will_call',[['THD114',6],['B872',4]]),
  won(-14,24816,60,'delivery',[['SF188CAST',6,69.95,'contract',CAST],['THL576',6,172,'custom',LABELS],['B873',4]]),
];

const first=(name:string)=>name.split(' ')[0];
const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
/** Historical freight and its road miles, priced by the live freight engine (spec §5.3) with haversine road miles. */
function freightFor(deal:Deal,subtotal:number){
  if(deal.fulfillment==='will_call')return {amount:0,miles:null};
  const branch=BRANCHES.find(b=>b.id===deal.branch)!;
  const {amount,miles}=priceDelivery({origin:branch.code,miles:haversineRoadMiles(branch,{lat:CUSTOMER.ship_to_lat,lng:CUSTOMER.ship_to_lng},DELIVERY_RATES.road_factor),subtotal,rates:DELIVERY_RATES});
  if(amount===CALL_FOR_FREIGHT)throw new Error(`Seeded delivery from ${branch.code} is beyond the delivery radius.`);
  return {amount,miles};
}

export function seedHistory({insert,anchor,syncedAt}:SeedContext){
  const rep=REPS.find(r=>r.id===CUSTOMER_REP)!;
  const lastOrderDay=Math.max(...DEALS.filter(d=>!d.quote||d.outcome==='accepted').map(d=>d.day));
  let orderIndex=0;
  for(const deal of DEALS){
    const lines=deal.lines.map(([sku,qty,price,basis='customer',customerPrice])=>{const item=catalogItem(sku);const unit=price??item.customer;return {item,qty,price:unit,basis,customerPrice:customerPrice??(basis==='customer'?unit:item.customer)};});
    const subtotal=round2(lines.reduce((sum,l)=>sum+l.qty*l.price,0));
    const {amount:freight,miles:freightMiles}=freightFor(deal,subtotal);
    const branch=BRANCHES.find(b=>b.id===deal.branch)!;
    const makesOrder=!deal.quote||deal.outcome==='accepted';
    const orderNumber=makesOrder?`SO-${51201+orderIndex}`:null;
    const po=makesOrder?String(7755+orderIndex):null;
    if(makesOrder)orderIndex++;

    let quoteId:string|null=null;
    if(deal.quote){
      quoteId=`q-${deal.quote}`;const quoteNumber=`Q-${deal.quote}`;const accepted=deal.outcome==='accepted';
      const requestedAt=accepted?at(anchor,deal.day-2,'15:20'):at(anchor,deal.day,'15:00');
      const createdAt=addMinutes(requestedAt,1),sentAt=addMinutes(requestedAt,deal.sendMinutes!);
      const validUntil=addDays(sentAt.slice(0,10),14);
      const respondedAt=accepted?at(anchor,deal.day,'16:05'):null;
      const expiredAt=`${addDays(validUntil,1)}T07:00:00.000Z`;
      const total=round2(subtotal+freight);
      insert('quotes',{id:quoteId,quote_number:quoteNumber,customer_id:CUSTOMER.id,contact_id:CONTACT.id,rep_id:rep.id,status:deal.outcome!,revision:1,conversation_id:null,
        request_text:`Can you quote ${lines.map(l=>`${l.qty} x ${l.item.description}`).join(', ')}?`,
        requested_at:requestedAt,created_at:createdAt,updated_at:respondedAt??expiredAt,sent_at:sentAt,responded_at:respondedAt,
        fulfillment:deal.fulfillment,branch_id:deal.branch,requested_date:null,fulfillment_time:accepted?at(anchor,deal.day+1,'15:00'):null,
        ship_to_address:`${CUSTOMER.ship_to_address}, ${CUSTOMER.ship_to_city}, ${CUSTOMER.ship_to_state} ${CUSTOMER.ship_to_zip}`,ship_to_lat:CUSTOMER.ship_to_lat,ship_to_lng:CUSTOMER.ship_to_lng,
        freight_override:null,freight_override_reason:null,valid_days:14,valid_until:validUntil,customer_po:accepted?po:null,customer_note:null,change_request_note:null,
        unread_for_rep:0,unread_for_customer:0,is_sample:0,duplicated_from:null});
      lines.forEach((l,i)=>insert('quote_lines',{id:`${quoteId}-${i+1}`,quote_id:quoteId!,line_no:i+1,item_id:l.item.sku,qty:l.qty,unit_price:l.price,price_basis:l.basis,
        suggested_price:l.basis==='custom'?l.customerPrice:l.price,suggested_basis:l.basis==='custom'?'customer':l.basis,customer_price:l.customerPrice,unit_cost:l.item.cost,
        explanation:null,requested_text:null,match_score:null,added_by:'querent'}));
      const snapshot={quote_number:quoteNumber,revision:1,customer:{name:CUSTOMER.name,account_number:CUSTOMER.account_number},contact:CONTACT.name,rep:rep.name,
        fulfillment:deal.fulfillment,branch:branch.code,valid_until:validUntil,subtotal,freight,total,
        ship_to:deal.fulfillment==='delivery'?`${CUSTOMER.ship_to_address}, ${CUSTOMER.ship_to_city}, ${CUSTOMER.ship_to_state} ${CUSTOMER.ship_to_zip}`:null,freight_miles:freightMiles,
        // What the customer PDF prints around the quote, as sendQuote freezes it (task 4.1).
        terms:CUSTOMER.terms,rep_contact:repContactOf(rep),letterhead:letterheadOf(SUPPLIER,{...branch,will_call_phone:branch.phone}),
        lines:lines.map(l=>({sku:l.item.sku,description:l.item.description,pack:l.item.pack,qty:l.qty,unit_price:l.price,total:round2(l.qty*l.price)}))};
      insert('quote_revisions',{id:`${quoteId}-r1`,quote_id:quoteId,revision:1,sent_at:sentAt,sent_by:rep.id,message:`Hi ${first(CONTACT.name)}, quote ${quoteNumber} is ready for you.`,attach_pdf:1,total,snapshot:JSON.stringify(snapshot)});
      const activity:[string,string,string|null,string,string][]=[
        [requestedAt,'customer',CONTACT.id,'requested',`${first(CONTACT.name)} asked for ${lines.length} items in Querent chat`],
        [createdAt,'querent',null,'drafted',`Draft quote built and sent to ${rep.name.split(' ')[0]} for review`],
        [sentAt,'rep',rep.id,'sent',`${rep.name} sent ${quoteNumber} rev 1 to ${first(CONTACT.name)} (${money(total)})`],
        accepted?[respondedAt!,'customer',CONTACT.id,'accepted',`${first(CONTACT.name)} accepted ${quoteNumber} rev 1 with PO ${po}`]:[expiredAt,'system',null,'expired',`${quoteNumber} expired without a response`],
      ];
      for(const [when,actor,actorId,kind,message] of activity)insert('quote_activity',{quote_id:quoteId,at:when,actor,actor_id:actorId,kind,message});
    }

    if(makesOrder){
      const id=orderNumber!.toLowerCase(),orderDate=addDays(anchor,deal.day),tax=round2(subtotal*TAX_RATE);
      const shipped=deal.day===lastOrderDay;
      insert('orders',{id,order_number:orderNumber,customer_id:CUSTOMER.id,quote_id:quoteId,po_number:po,order_date:orderDate,status:shipped?'shipped':'closed',
        fulfillment:deal.fulfillment,branch_id:deal.branch,shipped_on:deal.fulfillment==='will_call'?orderDate:addDays(anchor,deal.day+1),tracking_number:null,
        subtotal,freight,tax,total:round2(subtotal+freight+tax),...erp(orderNumber!,syncedAt)});
      lines.forEach((l,i)=>insert('order_lines',{id:`${id}-${i+1}`,order_id:id,line_no:i+1,item_id:l.item.sku,qty:l.qty,unit_price:l.price,unit_cost:l.item.cost,...erp(`${orderNumber}:${i+1}`,syncedAt)}));
    }
  }
}
