import {BRANCHES,type BranchId,DANA,DELIVERY_RATES,REPS,TAX_RATE,WASATCH,WASATCH_REP} from './accounts';
import {catalogItem} from './catalog';
import {addDays,addMinutes,at} from './dates';
import {haversineRoadMiles} from '../../freight/distance';
import {CALL_FOR_FREIGHT,priceDelivery} from '../../freight/engine';
import {erp,round2} from './insert';
import type {SeedContext} from './reference';

// Twelve months of Wasatch history, oldest first. Days are offsets from the anchor.
// It carries the mockup's facts: last paid $31.50 on bolts (day -42), $36.00 contract
// cut-off wheels and $79.00 gloves on the last order (day -14), flap discs bought with
// cut-off wheels, nuts and washers bought with bolts, no ratchet straps ever, and
// 17 of 24 quotes won (71%). Every won quote became exactly one order.

type Basis='contract'|'customer'|'list'|'last_paid'|'custom';
/** [sku, qty, unit price, basis (default customer), customer price at the time (default the unit price)] */
type Line=[sku:string,qty:number,price:number,basis?:Basis,customerPrice?:number];
interface Deal{day:number;quote?:number;outcome?:'accepted'|'expired';sendMinutes?:number;fulfillment:'will_call'|'delivery';branch:BranchId;lines:Line[]}
const won=(day:number,quote:number,sendMinutes:number,fulfillment:Deal['fulfillment'],branch:BranchId,lines:Line[]):Deal=>({day,quote,outcome:'accepted',sendMinutes,fulfillment,branch,lines});
const lost=(day:number,quote:number,sendMinutes:number,fulfillment:Deal['fulfillment'],branch:BranchId,lines:Line[]):Deal=>({day,quote,outcome:'expired',sendMinutes,fulfillment,branch,lines});
const order=(day:number,fulfillment:Deal['fulfillment'],branch:BranchId,lines:Line[]):Deal=>({day,fulfillment,branch,lines});

export const DEALS:Deal[]=[
  won(-358,24793,95,'will_call','slc',[['HCS-12-13-2G8',10,29.50],['HN-12-13-G8',5,15.90],['FW-12-G8',3,12.40]]),
  won(-340,24794,140,'delivery','slc',[['CW-45-045-T1',8,38.25],['FD-45-60Z',4,46.90]]),
  order(-330,'will_call','slc',[['GLV-N8-L-1000',3,74.00],['SG-CLR-AF',2,27.50]]),
  lost(-322,24795,55,'delivery','slc',[['DT-2-60',2,96.00],['RAG-WHT-25',3,44.25]]),
  won(-310,24796,210,'delivery','slc',[['HCS-12-13-2G8',10,29.50],['HN-12-13-G8',5,15.90],['FW-12-G8',4,12.40],['ANC-12-414-W',2,25.20]]),
  order(-296,'will_call','ogden',[['TEK-12-1-HWH',6,17.20],['MK-PNT-WHT',2,22.80]]),
  won(-270,24797,75,'delivery','slc',[['CW-45-045-T1',10,38.25],['FD-45-60Z',5,46.90],['WB-4-CS',6,13.40]]),
  lost(-262,24798,180,'will_call','slc',[['HV-C2-LM-XL',20,9.95],['HH-T1-WHT',12,16.95]]),
  won(-252,24799,48,'will_call','slc',[['GLV-N8-L-1000',3,76.50],['EP-FOAM-200',2,32.10]]),
  order(-240,'delivery','slc',[['DEG-HD-4G',3,38.90],['TL-55-BLK',2,32.60],['RAG-WHT-25',2,43.10]]),
  won(-232,24800,120,'will_call','slc',[['HCS-12-13-2G8',8,29.80],['HN-12-13-G8',4,16.10]]),
  lost(-218,24801,260,'will_call','slc',[['DBS-29-HSS',2,58.95],['SKT-38-SAE-24',1,72.50]]),
  won(-205,24802,65,'delivery','slc',[['CW-45-045-T1',10,36.00,'contract',38.95],['SD-5-80-HL',4,17.90]]),
  order(-190,'will_call','provo',[['UKB-HD-100',3,17.50],['TM-25',6,13.20]]),
  won(-170,24803,150,'delivery','slc',[['DT-2-60',1,94.50],['TL-55-BLK',2,33.00]]),
  lost(-162,24804,95,'will_call','slc',[['GLV-CR-A4-L',4,64.95],['SG-SMK-AF',2,29.90]]),
  won(-155,24805,40,'will_call','slc',[['HCS-12-13-2G8',12,30.40,'last_paid',29.80],['HN-12-13-G8',6,16.30],['FW-12-G8',5,12.70]]),
  won(-141,24806,85,'will_call','slc',[['GLV-N8-L-1000',4,78.00],['SG-CLR-AF',2,29.40]]),
  order(-128,'delivery','slc',[['ANC-12-414-W',3,25.60],['TEK-12-1-HWH',4,17.50]]),
  won(-113,24807,130,'will_call','slc',[['EP-FOAM-200',3,32.95],['RESP-N95-20',4,26.50]]),
  won(-97,24808,55,'delivery','slc',[['CW-45-045-T1',6,36.00,'contract',38.95],['FD-45-60Z',4,44.25,'contract',47.50]]),
  won(-84,24809,175,'will_call','ogden',[['DEG-HD-4G',2,39.50],['RAG-WHT-25',2,43.80],['MK-PNT-WHT',1,23.10]]),
  lost(-77,24810,220,'delivery','slc',[['TC-38-G70-20',2,73.50],['LB-38-LVR',2,36.95]]),
  order(-70,'will_call','slc',[['HV-C2-LM-XL',10,9.80],['EP-FOAM-200',2,32.60]]),
  won(-56,24811,70,'delivery','slc',[['DT-2-60',2,94.50,'last_paid',93.00],['UKB-HD-100',2,17.80]]),
  won(-42,24812,35,'will_call','slc',[['HCS-12-13-2G8',10,31.50,'custom',30.95],['HN-12-13-G8',5,16.50],['FW-12-G8',4,12.95]]),
  lost(-35,24813,160,'will_call','slc',[['SKT-38-SAE-24',1,72.50],['DBS-29-HSS',1,58.95]]),
  won(-28,24814,90,'delivery','provo',[['TL-55-BLK',3,33.50],['DEG-HD-4G',2,39.95]]),
  lost(-21,24815,45,'will_call','slc',[['HH-T1-WHT',12,16.95],['HV-C2-LM-XL',12,9.95]]),
  won(-14,24816,60,'delivery','slc',[['CW-45-045-T1',4,36.00,'contract',38.95],['GLV-N8-L-1000',4,79.00,'custom',77.50],['FD-45-60Z',3,44.25,'contract',47.50]]),
];

const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
/** Historical freight and its road miles, priced by the live freight engine (spec §5.3) with haversine road miles. */
function freightFor(deal:Deal,subtotal:number){
  if(deal.fulfillment==='will_call')return {amount:0,miles:null};
  const branch=BRANCHES.find(b=>b.id===deal.branch)!;
  const {amount,miles}=priceDelivery({origin:branch.code,miles:haversineRoadMiles(branch,{lat:WASATCH.ship_to_lat,lng:WASATCH.ship_to_lng}),subtotal,rates:DELIVERY_RATES});
  if(amount===CALL_FOR_FREIGHT)throw new Error(`Seeded delivery from ${branch.code} is beyond the delivery radius.`);
  return {amount,miles};
}

export function seedHistory({insert,anchor,syncedAt}:SeedContext){
  const rep=REPS.find(r=>r.id===WASATCH_REP)!;
  const lastOrderDay=Math.max(...DEALS.filter(d=>!d.quote||d.outcome==='accepted').map(d=>d.day));
  let orderIndex=0;
  for(const deal of DEALS){
    const lines=deal.lines.map(([sku,qty,price,basis='customer',customerPrice=price])=>({item:catalogItem(sku),qty,price,basis,customerPrice}));
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
      insert('quotes',{id:quoteId,quote_number:quoteNumber,customer_id:WASATCH.id,contact_id:DANA.id,rep_id:rep.id,status:deal.outcome!,revision:1,conversation_id:null,
        request_text:`Can you quote ${lines.map(l=>`${l.qty} x ${l.item.description}`).join(', ')}?`,
        requested_at:requestedAt,created_at:createdAt,updated_at:respondedAt??expiredAt,sent_at:sentAt,responded_at:respondedAt,
        fulfillment:deal.fulfillment,branch_id:deal.branch,requested_date:null,fulfillment_time:accepted?at(anchor,deal.day+1,'15:00'):null,
        ship_to_address:`${WASATCH.ship_to_address}, ${WASATCH.ship_to_city}, ${WASATCH.ship_to_state} ${WASATCH.ship_to_zip}`,ship_to_lat:WASATCH.ship_to_lat,ship_to_lng:WASATCH.ship_to_lng,
        freight_override:null,freight_override_reason:null,valid_days:14,valid_until:validUntil,customer_po:accepted?po:null,customer_note:null,change_request_note:null,
        unread_for_rep:0,unread_for_customer:0,is_sample:0,duplicated_from:null});
      lines.forEach((l,i)=>insert('quote_lines',{id:`${quoteId}-${i+1}`,quote_id:quoteId!,line_no:i+1,item_id:l.item.sku,qty:l.qty,unit_price:l.price,price_basis:l.basis,
        suggested_price:l.basis==='custom'?l.customerPrice:l.price,suggested_basis:l.basis==='custom'?'customer':l.basis,customer_price:l.customerPrice,unit_cost:l.item.cost,
        explanation:null,requested_text:null,match_score:null,added_by:'querent'}));
      const snapshot={quote_number:quoteNumber,revision:1,customer:{name:WASATCH.name,account_number:WASATCH.account_number},contact:DANA.name,rep:rep.name,
        fulfillment:deal.fulfillment,branch:branch.code,valid_until:validUntil,subtotal,freight,total,
        ship_to:deal.fulfillment==='delivery'?`${WASATCH.ship_to_address}, ${WASATCH.ship_to_city}, ${WASATCH.ship_to_state} ${WASATCH.ship_to_zip}`:null,freight_miles:freightMiles,
        lines:lines.map(l=>({sku:l.item.sku,description:l.item.description,pack:l.item.pack,qty:l.qty,unit_price:l.price,total:round2(l.qty*l.price)}))};
      insert('quote_revisions',{id:`${quoteId}-r1`,quote_id:quoteId,revision:1,sent_at:sentAt,sent_by:rep.id,message:`Hi Dana, quote ${quoteNumber} is ready for you.`,attach_pdf:1,total,snapshot:JSON.stringify(snapshot)});
      const activity:[string,string,string|null,string,string][]=[
        [requestedAt,'customer',DANA.id,'requested',`Dana asked for ${lines.length} items in Querent chat`],
        [createdAt,'querent',null,'drafted',`Draft quote built and sent to ${rep.name.split(' ')[0]} for review`],
        [sentAt,'rep',rep.id,'sent',`${rep.name} sent ${quoteNumber} rev 1 to Dana (${money(total)})`],
        accepted?[respondedAt!,'customer',DANA.id,'accepted',`Dana accepted ${quoteNumber} rev 1 with PO ${po}`]:[expiredAt,'system',null,'expired',`${quoteNumber} expired without a response`],
      ];
      for(const [when,actor,actorId,kind,message] of activity)insert('quote_activity',{quote_id:quoteId,at:when,actor,actor_id:actorId,kind,message});
    }

    if(makesOrder){
      const id=orderNumber!.toLowerCase(),orderDate=addDays(anchor,deal.day),tax=round2(subtotal*TAX_RATE);
      const shipped=deal.day===lastOrderDay;
      insert('orders',{id,order_number:orderNumber,customer_id:WASATCH.id,quote_id:quoteId,po_number:po,order_date:orderDate,status:shipped?'shipped':'closed',
        fulfillment:deal.fulfillment,branch_id:deal.branch,shipped_on:deal.fulfillment==='will_call'?orderDate:addDays(anchor,deal.day+1),tracking_number:null,
        subtotal,freight,tax,total:round2(subtotal+freight+tax),...erp(orderNumber!,syncedAt)});
      lines.forEach((l,i)=>insert('order_lines',{id:`${id}-${i+1}`,order_id:id,line_no:i+1,item_id:l.item.sku,qty:l.qty,unit_price:l.price,unit_cost:l.item.cost,...erp(`${orderNumber}:${i+1}`,syncedAt)}));
    }
  }
}
