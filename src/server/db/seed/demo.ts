import type Database from 'better-sqlite3';
import type {DeclineReason} from '@/domain';
import {toCents} from '@/lib/money';
import {COST_MODEL_DEFAULTS,modelledDeliveryCost} from '../../freight/cost-model';
import {haversineRoadMiles} from '../../freight/distance';
import {CALL_FOR_FREIGHT,priceDelivery} from '../../freight/engine';
import {POOL_DEFAULTS} from '../../freight/pool';
import {allocateRecovery} from '../../freight/recovery';
import {validUntilFor} from '../../quotes/lifecycle';
import {DECLINE_REASON_LABELS} from '../../quotes/response-rules';
import {customerUnitPrice,letterheadOf,repContactOf} from '../../quotes/snapshot';
import {BRANCHES,DELIVERY_RATES,DEMO_CUSTOMERS,REPS,SUPPLIER,type DemoCustomer} from './accounts';
import {catalogItem} from './catalog';
import {addDays,addMinutes} from './dates';
import {round2,type Insert} from './insert';
import {SEED_FUEL_PRICES,type SeedContext} from './reference';

// The demo book (v3 decisions 38 and 39, OA-20; task F1): Mara's and Eli's quotes, and three of
// Mara's that Brandi covered, so the Team dashboard has reps to compare, the pool rate can be
// computed, and every status shows up. Like ./aging, every time is relative to the reset time
// (`now`), not the anchor, so each `npm run db:reset` and POST /api/test/reset gives the same mix
// on any day, and the pool's trailing 90 days and the Team dashboard's 30-day preset always cover it:
//   - aging: Mara and Eli each have fresh, Aging (amber) and Overdue (red) open quotes, two of them
//     amber or red by the sent rule's expiry clause (valid until tomorrow, or today);
//   - 22 accepted delivery quotes from the last 90 days that carry freight recovery (Mara 8, Eli 11,
//     Brandi 3), so the computed pool rate replaces the 3.0% starting rate once free delivery is on;
//   - every status: drafts, change requests, sent, accepted (also will call and one under the free
//     delivery threshold), declined with each reason (one Other with a note, one with none), expired;
//   - reassigned quotes (original_rep_id ≠ rep_id, a 'reassigned' activity naming both reps), pop-up
//     suggestions offered and added (added_by 'suggestion'), and a few rep upsell lines.
//
// Free delivery pricing ran as a pilot until PILOT_ENDS hours before the reset, at the 3.0% starting
// rate with the ramp complete; it is off now (the demo turns it back on). A delivery quote created
// during the pilot whose goods reach the free-delivery threshold carries recovery: its rate is frozen
// (freight_rate_bp), its lines' recovery comes from the margin-weighted allocation (freight/recovery)
// and its freight is $0.00. Every delivery quote freezes its modelled cost (freight/cost-model, the
// default inputs and the seeded UT gasoline price; OA-47). Times, prices and recovery all come from
// the same pure functions the app uses, so the figures agree with what the app would compute.
//
// Numbers sit below the aging quotes' (Q-24789…), oldest first, so Q-24817 stays the highest and the
// next request is still Q-24818. Accepted quotes make no orders (TODO(R-1)).

const H=3_600_000,D=24;
/** When the free delivery pricing pilot ended, in hours before the reset. */
export const PILOT_ENDS=6*D;
/** The rate the pilot froze into its quotes: the starting rate, at the last ramp step. */
export const PILOT_RATE_BP=POOL_DEFAULTS.startingRateBp;

type RepId='brandi'|'mara'|'eli';
type CustomerId=DemoCustomer['id'];
type Line=[sku:string,qty:number];

/** Typical orders. Every one reaches the $1,500 free-delivery threshold at the customer's price level. */
const ORDERS={
  fasteners:[['HCS-12-13-2G8',30],['HN-12-13-G8',20],['FW-12-G8',20]],
  abrasives:[['CW-45-045-T1',24],['FD-45-60Z',12],['GW-45-14-T27',4]],
  ppe:[['GLV-N8-L-1000',12],['SG-CLR-AF',10],['HV-C2-LM-XL',40]],
  tiedowns:[['RS-2-30-FH',30],['RS-4-30-FH',12],['TC-38-G70-20',6],['LB-38-LVR',6]],
  anchors:[['ANC-12-414-W',40],['TEK-12-1-HWH',30]],
} satisfies Record<string,Line[]>;
type Order=keyof typeof ORDERS;
const order=(name:Order,scale=1):Line[]=>ORDERS[name].map(([sku,qty])=>[sku,Math.round(qty*scale)]);

interface Suggested {offered:[sku:string,reason:string][];added:string[]}
export interface DemoQuote {
  /** The rep the quote was created for (original_rep_id). */
  rep:RepId;customer:CustomerId;fulfillment:'delivery'|'will_call';lines:Line[];
  /** Hours before the reset: the request (created a minute later), the first send, the customer's answer. */
  at:number;sent?:number;responded?:number;
  status:'ready_for_review'|'sent'|'changes_requested'|'accepted'|'declined'|'expired';
  /** valid_days (7, 14 or 30; 14 by default), or a custom valid_until in days from the reset's day. */
  validDays?:7|14|30;validUntilDay?:number;
  reason?:DeclineReason|null;note?:string;
  /** Moved to `owner` by Brandi, `moved` hours before the reset. */
  owner?:RepId;moved?:number;
  /** The rep opened the draft (last_rep_touch_at); sent quotes are touched when sent. The customer opened the sent PDF, hours before the reset. */
  touched?:boolean;viewed?:number;
  unread?:boolean;suggest?:Suggested;upsell?:Line[];
}

const accepted=(rep:RepId,customer:CustomerId,lines:Line[],days:number,extra:Partial<DemoQuote>={}):DemoQuote=>
  ({rep,customer,fulfillment:'delivery',lines,at:days*D+4*D,sent:days*D+4*D-2,responded:days*D,status:'accepted',viewed:days*D+D,...extra});
const declined=(rep:RepId,customer:CustomerId,lines:Line[],days:number,reason:DeclineReason|null,extra:Partial<DemoQuote>={}):DemoQuote=>
  ({rep,customer,fulfillment:'delivery',lines,at:days*D+3*D,sent:days*D+3*D-2,responded:days*D,status:'declined',reason,viewed:days*D+2,...extra});
const fromBolts='Matches the 1/2-13 Grade 8 bolts on your list.';

export const DEMO_QUOTES:readonly DemoQuote[]=[
  // Accepted deliveries that carry recovery: the pool's eligible quotes.
  accepted('mara','canyon-ridge',order('fasteners'),4),
  accepted('mara','canyon-ridge',order('abrasives',1.5),11,{suggest:{offered:[['FD-45-80Z','Often bought with cut-off wheels.'],['SD-5-80-HL','Often bought with flap discs.'],['WB-4-CS','Often bought with grinding wheels.']],added:['FD-45-80Z']}}),
  accepted('mara','canyon-ridge',order('ppe'),19),
  accepted('mara','canyon-ridge',order('tiedowns'),27),
  accepted('mara','canyon-ridge',order('anchors',1.25),36),
  accepted('mara','canyon-ridge',order('fasteners',2),45,{upsell:[['SG-SMK-AF',2]]}),
  accepted('mara','canyon-ridge',order('abrasives'),58),
  accepted('mara','canyon-ridge',order('ppe',1.5),71),
  // Mara's drafts Brandi priced and sent while Mara was out.
  accepted('mara','canyon-ridge',order('tiedowns',1.25),15,{owner:'brandi',moved:19*D-1}),
  accepted('mara','canyon-ridge',order('fasteners',1.5),40,{owner:'brandi',moved:44*D-1}),
  accepted('mara','canyon-ridge',order('anchors'),63,{owner:'brandi',moved:67*D-1}),
  accepted('eli','utah-valley-electric',order('abrasives'),3),
  accepted('eli','utah-valley-electric',order('ppe',1.25),9,{upsell:[['EP-FOAM-200',2]]}),
  accepted('eli','utah-valley-electric',order('anchors'),22),
  accepted('eli','utah-valley-electric',order('fasteners'),33,{suggest:{offered:[['LW-12-ZP',fromBolts],['ANC-12-414-W','Often bought with hex cap screws.']],added:['LW-12-ZP','ANC-12-414-W']}}),
  accepted('eli','utah-valley-electric',order('tiedowns',1.5),50),
  accepted('eli','utah-valley-electric',order('abrasives',2),66),
  accepted('eli','weber-basin',order('fasteners',1.25),6),
  accepted('eli','weber-basin',order('tiedowns'),17),
  accepted('eli','weber-basin',order('ppe'),29),
  accepted('eli','weber-basin',order('anchors',1.5),47),
  accepted('eli','weber-basin',order('abrasives',1.25),80),
  // Accepted but not in the pool: will call, and a delivery under the free-delivery threshold.
  accepted('mara','canyon-ridge',[['SG-CLR-AF',6],['EP-FOAM-200',4]],8,{fulfillment:'will_call'}),
  accepted('eli','weber-basin',[['WB-4-CS',6],['SD-5-80-HL',4]],13,{fulfillment:'will_call'}),
  accepted('eli','utah-valley-electric',[['HCS-12-13-2G8',8],['HN-12-13-G8',4]],24),

  // Declined, with each reason, an Other note, and none.
  declined('mara','canyon-ridge',order('abrasives'),5,'price_too_high',{suggest:{offered:[['FD-45-80Z','Often bought with cut-off wheels.'],['WB-4-CS','Often bought with grinding wheels.']],added:[]}}),
  declined('mara','canyon-ridge',order('anchors'),12,'other',{note:'The general contractor is supplying the anchors on this job.'}),
  declined('mara','canyon-ridge',order('tiedowns'),20,'need_sooner',{fulfillment:'will_call'}),
  declined('eli','utah-valley-electric',order('ppe'),8,'found_other_source'),
  declined('eli','weber-basin',order('fasteners'),14,'wrong_items'),
  declined('eli','weber-basin',[['GLV-N6-L-1000',6],['RESP-N95-20',4]],3,null,{fulfillment:'will_call',unread:true}),

  // Expired with no response: one the customer opened, two they never did.
  {rep:'mara',customer:'canyon-ridge',fulfillment:'delivery',lines:order('ppe'),at:24*D,sent:24*D-2,status:'expired',viewed:23*D},
  {rep:'eli',customer:'utah-valley-electric',fulfillment:'will_call',lines:[['DBS-29-HSS',2],['DB-12-COB',12]],at:26*D,sent:26*D-3,status:'expired'},
  {rep:'eli',customer:'weber-basin',fulfillment:'delivery',lines:order('tiedowns'),at:21*D,sent:21*D-2,validDays:7,status:'expired'},

  // Open quotes: Mara's.
  {rep:'mara',customer:'canyon-ridge',fulfillment:'delivery',lines:order('fasteners'),at:1,status:'ready_for_review',unread:true},
  {rep:'mara',customer:'canyon-ridge',fulfillment:'delivery',lines:order('tiedowns'),at:30,status:'ready_for_review'},
  {rep:'mara',customer:'canyon-ridge',fulfillment:'will_call',lines:[['CW-45-045-T27',8],['FD-45-80Z',4]],at:98,sent:96,status:'sent'},
  {rep:'mara',customer:'canyon-ridge',fulfillment:'delivery',lines:order('anchors'),at:42,sent:40,validDays:7,validUntilDay:1,status:'sent',viewed:30},
  {rep:'mara',customer:'canyon-ridge',fulfillment:'delivery',lines:order('ppe'),at:56,sent:54,responded:28,status:'changes_requested',
    note:'Can you split this into two deliveries, half now and half next month?'},
  // Moved to Eli while Mara was out: one he sent, one still a draft.
  {rep:'mara',customer:'canyon-ridge',fulfillment:'delivery',lines:order('abrasives'),at:3*D,sent:3*D-5,owner:'eli',moved:3*D-2,status:'sent'},
  {rep:'mara',customer:'canyon-ridge',fulfillment:'will_call',lines:[['RS-2-30-FH',12],['EDG-2-4PK',6]],at:10,owner:'eli',moved:8,status:'ready_for_review'},

  // Open quotes: Eli's.
  {rep:'eli',customer:'weber-basin',fulfillment:'delivery',lines:order('abrasives'),at:2,status:'ready_for_review',unread:true,
    suggest:{offered:[['FD-45-80Z','Often bought with cut-off wheels.'],['SD-5-80-HL','Often bought with flap discs.'],['WB-4-CS','Often bought with grinding wheels.']],added:['SD-5-80-HL']}},
  {rep:'eli',customer:'utah-valley-electric',fulfillment:'delivery',lines:order('fasteners'),at:6,status:'ready_for_review',touched:true},
  {rep:'eli',customer:'utah-valley-electric',fulfillment:'delivery',lines:order('ppe'),at:8*D+3,sent:8*D,status:'sent',viewed:6*D},
  {rep:'eli',customer:'weber-basin',fulfillment:'will_call',lines:[['TM-25',6],['UKB-HD-100',4]],at:32,sent:30,status:'sent'},
  {rep:'eli',customer:'weber-basin',fulfillment:'delivery',lines:order('anchors'),at:52,sent:50,validDays:7,validUntilDay:0,status:'sent',viewed:20},
  {rep:'eli',customer:'utah-valley-electric',fulfillment:'delivery',lines:order('tiedowns'),at:34,sent:32,responded:6,status:'changes_requested',
    note:'Please swap the 4 in straps for 2 in ones with flat hooks.'},
];

/** The first demo quote number: the demo quotes end just below the aging quotes (Q-24789). */
export const FIRST_DEMO_NUMBER=24789-DEMO_QUOTES.length;

const repOf=(id:RepId)=>REPS.find(r=>r.id===id)!;
const firstName=(name:string)=>name.split(' ')[0];
const money=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});
const plural=(n:number,word:string)=>`${n} ${n===1?word:`${word}s`}`;
const customerOf=(id:CustomerId)=>DEMO_CUSTOMERS.find(c=>c.id===id)!;
const shipTo=(c:DemoCustomer)=>`${c.ship_to_address}, ${c.ship_to_city}, UT ${c.ship_to_zip}`;
const UT_GASOLINE=SEED_FUEL_PRICES.find(p=>p.state==='UT'&&p.fuel==='gasoline')!.price_cents;

/** Road miles from the customer's branch to its ship-to (haversine × road factor, as the app measures them). */
export function demoRoadMiles(customer:DemoCustomer){
  const branch=BRANCHES.find(b=>b.id===customer.branch)!;
  return haversineRoadMiles(branch,{lat:customer.ship_to_lat,lng:customer.ship_to_lng},DELIVERY_RATES.road_factor);
}

/** The modelled cost of one delivery `miles` away at the default cost-model inputs and the seeded UT gasoline price (spec §4.2). */
export function demoModelledCents(miles:number){
  const s=COST_MODEL_DEFAULTS;
  return modelledDeliveryCost({miles,mpg:s.mpg,fuelPriceCents:s.fuelManualCents??UT_GASOLINE,wearCentsPerMile:s.wearCentsPerMile,depreciationCentsPerMile:s.depreciationCentsPerMile,
    driverCentsPerHour:s.driverCentsPerHour,avgSpeedMph:s.avgSpeedMph,stopMinutes:s.stopMinutes}).cents;
}

/**
 * Seeds the demo book's quotes at the reset time `now`. A database built at the v4 schema (the
 * adoption test's fixture) has none of the v3 columns yet, so it gets none: its customers only.
 */
export function seedDemoQuotes(database:Database.Database,{insert}:SeedContext,now:string){
  if(!database.prepare("SELECT 1 FROM pragma_table_info('quotes') WHERE name='original_rep_id'").get())return;
  const ago=(hours:number)=>new Date(Date.parse(now)-hours*H).toISOString();
  const today=now.slice(0,10);
  const numbered=[...DEMO_QUOTES].sort((a,b)=>b.at-a.at);
  numbered.forEach((q,i)=>seedOne(insert,q,FIRST_DEMO_NUMBER+i,ago,today));
}

function seedOne(insert:Insert,q:DemoQuote,number:number,ago:(hours:number)=>string,today:string){
  const id=`q-${number}`,quoteNumber=`Q-${number}`;
  const customer=customerOf(q.customer),contact=customer.contact,branch=BRANCHES.find(b=>b.id===customer.branch)!;
  const original=repOf(q.rep),owner=repOf(q.owner??q.rep);
  const requestedAt=ago(q.at),createdAt=addMinutes(requestedAt,1);
  const movedAt=q.moved===undefined?null:ago(q.moved);
  const sentAt=q.sent===undefined?null:ago(q.sent);
  // Whoever owned the quote when it was sent sent it.
  const sender=movedAt&&sentAt&&movedAt<sentAt?owner:original;
  const respondedAt=q.responded===undefined?null:ago(q.responded);
  const validDays=q.validDays??14;
  const expiresOn=q.validUntilDay===undefined?null:addDays(today,q.validUntilDay);
  const validUntil=sentAt?expiresOn??validUntilFor(sentAt,validDays):null;

  const lines=[
    ...q.lines.map(([sku,qty])=>({item:catalogItem(sku),qty,addedBy:'querent'})),
    ...(q.suggest?.added??[]).map(sku=>({item:catalogItem(sku),qty:1,addedBy:'suggestion'})),
    ...(q.upsell??[]).map(([sku,qty])=>({item:catalogItem(sku),qty,addedBy:'upsell'})),
  ].map((l,i)=>({...l,line_no:i+1,price:l.item.customer}));
  const subtotal=round2(lines.reduce((sum,l)=>sum+l.qty*l.price,0));

  // Freight, the modelled cost and recovery, as the app freezes them at creation (spec §4.1–4.5).
  const delivery=q.fulfillment==='delivery';
  const miles=delivery?demoRoadMiles(customer):null;
  const carries=delivery&&q.at>=PILOT_ENDS&&toCents(subtotal)>=toCents(DELIVERY_RATES.free_threshold);
  const freight=miles===null?{amount:0,miles:null}:priceDelivery({origin:branch.code,miles,subtotal,rates:DELIVERY_RATES,freeDeliveryPricing:carries});
  if(freight.amount===CALL_FOR_FREIGHT)throw new Error(`${quoteNumber}: ${customer.name} is beyond the delivery radius.`);
  const recovery=carries?allocateRecovery({rateBp:PILOT_RATE_BP,lineCapBp:POOL_DEFAULTS.lineCapBp,
    lines:lines.map(l=>({line_no:l.line_no,qty:l.qty,unitPriceCents:toCents(l.price),unitCostCents:toCents(l.item.cost),basis:'customer' as const}))}):[];
  const recoveryOf=(lineNo:number)=>recovery.find(r=>r.line_no===lineNo)?.freight_recovery??0;

  const conversationId=q.suggest?`conv-${id}`:null;
  const touchedAt=sentAt??(q.touched?addMinutes(movedAt??createdAt,90):null);
  const viewedAt=q.viewed===undefined?null:ago(q.viewed);
  const declinedAt=q.status==='declined'?respondedAt:null;
  const expiredAt=q.status==='expired'?`${addDays(validUntil!,1)}T07:00:00.000Z`:null;
  const updatedAt=expiredAt??respondedAt??sentAt??movedAt??createdAt;

  if(conversationId){
    // The chat behind the quote: the request, the item pop-up with its suggestions, Request quote and the confirmation.
    const started=addMinutes(requestedAt,-3),popupId=`${conversationId}-2`;
    insert('conversations',{id:conversationId,customer_id:customer.id,contact_id:contact.id,started_at:started});
    const suggestions=q.suggest!.offered.map(([sku,reason])=>{const item=catalogItem(sku);return {item_id:item.sku,sku:item.sku,description:item.description,pack:item.pack,reason};});
    const where=delivery?`delivery from ${branch.code}`:`pickup at ${branch.code}`;
    const messages:[number,string,string,string,unknown][]=[
      [0,'customer','text',`Can you quote ${q.lines.map(([sku,qty])=>`${qty} x ${catalogItem(sku).description}`).join(', ')}?`,null],
      [1,'assistant','item_popup','Here is your list. Check the quantities, choose pickup or delivery, then press Request quote.',
        {fulfillment:q.fulfillment,branch_id:branch.id,lines:q.lines.map(([sku,qty])=>({sku,qty})),suggestions,suggestions_offered:suggestions.length}],
      [2,'customer','text',`Request quote: ${lines.filter(l=>l.addedBy!=='upsell').map(l=>`${l.qty} × ${l.item.sku}`).join(', ')} (${where}).`,null],
      [2.1,'assistant','quote_requested',`Sent to ${firstName(original.name)} for review. Your quote number is **${quoteNumber}**. ${firstName(original.name)} will price it and send it to you here in chat.`,
        {quote_id:id,quote_number:quoteNumber,status:'ready_for_review',popup_message_id:popupId}],
    ];
    messages.forEach(([minutes,role,kind,content,payload],i)=>insert('messages',{id:`${conversationId}-${i+1}`,conversation_id:conversationId,role,kind,content,
      payload:payload===null?null:JSON.stringify(payload),created_at:addMinutes(started,minutes)}));
  }

  insert('quotes',{id,quote_number:quoteNumber,customer_id:customer.id,contact_id:contact.id,rep_id:owner.id,original_rep_id:original.id,status:q.status,revision:sentAt?1:0,conversation_id:conversationId,
    request_text:`Can you quote ${q.lines.map(([sku,qty])=>`${qty} x ${catalogItem(sku).description}`).join(', ')}?`,
    requested_at:requestedAt,created_at:createdAt,updated_at:updatedAt,sent_at:sentAt,responded_at:respondedAt,
    fulfillment:q.fulfillment,branch_id:branch.id,requested_date:null,fulfillment_time:q.status==='accepted'?addMinutes(respondedAt!,D*60):null,
    ship_to_address:shipTo(customer),ship_to_lat:customer.ship_to_lat,ship_to_lng:customer.ship_to_lng,freight_override:null,freight_override_reason:null,
    valid_days:validDays,valid_until:validUntil,expires_on:expiresOn,customer_po:q.status==='accepted'?`${customer.account_number.slice(0,3)}-${number}`:null,customer_note:null,
    change_request_note:q.status==='changes_requested'?q.note!:null,unread_for_rep:q.unread?1:0,unread_for_customer:0,is_sample:0,duplicated_from:null,
    freight_rate_bp:carries?PILOT_RATE_BP:null,freight_ramp_step:carries?POOL_DEFAULTS.rampSteps:null,freight_ramp_steps:carries?POOL_DEFAULTS.rampSteps:null,
    modelled_freight_cents:miles===null?null:demoModelledCents(miles),
    last_rep_touch_at:touchedAt,customer_viewed_at:viewedAt,declined_at:declinedAt,decline_reason:q.status==='declined'?q.reason??null:null,
    decline_note:q.status==='declined'&&q.reason==='other'?q.note??null:null});
  for(const l of lines)insert('quote_lines',{id:`${id}-${l.line_no}`,quote_id:id,line_no:l.line_no,item_id:l.item.sku,qty:l.qty,unit_price:l.price,price_basis:'customer',
    suggested_price:l.price,suggested_basis:'customer',customer_price:l.price,unit_cost:l.item.cost,explanation:null,requested_text:null,match_score:null,added_by:l.addedBy,
    freight_recovery:recoveryOf(l.line_no)});

  let total=subtotal;
  if(sentAt){
    // What the customer was sent: the customer-facing unit prices (recovery included) and the freight.
    const sentLines=lines.map(l=>{const unit=customerUnitPrice(l.price,recoveryOf(l.line_no));return {sku:l.item.sku,description:l.item.description,pack:l.item.pack,qty:l.qty,unit_price:unit,total:round2(l.qty*unit)};});
    const sentSubtotal=round2(sentLines.reduce((sum,l)=>sum+l.total,0));
    total=round2(sentSubtotal+freight.amount);
    const snapshot={quote_number:quoteNumber,revision:1,sent_at:sentAt,customer:{name:customer.name,account_number:customer.account_number},contact:contact.name,rep:sender.name,
      fulfillment:q.fulfillment,branch:branch.code,ship_to:delivery?shipTo(customer):null,valid_days:validDays,valid_until:validUntil,expires_on:expiresOn,customer_po:null,customer_note:null,
      subtotal:sentSubtotal,freight:freight.amount,total,lines:sentLines,freight_miles:freight.miles,
      terms:customer.terms,rep_contact:repContactOf(sender),letterhead:letterheadOf(SUPPLIER,{...branch,will_call_phone:branch.phone})};
    insert('quote_revisions',{id:`${id}-r1`,quote_id:id,revision:1,sent_at:sentAt,sent_by:sender.id,message:`Hi ${firstName(contact.name)}, quote ${quoteNumber} is ready for you.`,attach_pdf:1,total,snapshot:JSON.stringify(snapshot)});
  }

  const who=firstName(contact.name);
  const activity:[string,string,string|null,string,string][]=[
    [requestedAt,'customer',contact.id,'requested',`${who} asked for ${plural(lines.filter(l=>l.addedBy!=='upsell').length,'item')} in Querent chat`],
    [createdAt,'querent',null,'drafted',`Draft quote built and sent to ${firstName(original.name)} for review`],
  ];
  if(movedAt)activity.push([movedAt,'rep','brandi','reassigned',`Brandi Gallegos reassigned ${quoteNumber} from ${original.name} to ${owner.name}`]);
  if(sentAt)activity.push([sentAt,'rep',sender.id,'sent',`${sender.name} sent ${quoteNumber} rev 1 to ${who} (${money(total)})`]);
  if(q.status==='accepted')activity.push([respondedAt!,'customer',contact.id,'accepted',`${who} accepted ${quoteNumber} rev 1 (${money(total)}) with PO ${customer.account_number.slice(0,3)}-${number}, ${delivery?`delivery from ${branch.code}`:`pickup at ${branch.code}`}`]);
  if(q.status==='changes_requested')activity.push([respondedAt!,'customer',contact.id,'changes_requested',`${who} requested changes to ${quoteNumber} rev 1: "${q.note}"`]);
  if(q.status==='declined')activity.push([respondedAt!,'customer',contact.id,'declined',
    `${who} declined ${quoteNumber} rev 1${q.reason?`: ${DECLINE_REASON_LABELS[q.reason]}${q.reason==='other'&&q.note?`: "${q.note}"`:''}`:' (no reason given)'}`]);
  if(expiredAt)activity.push([expiredAt,'system',null,'expired',`${quoteNumber} rev 1 expired without a response`]);
  for(const [when,actor,actorId,kind,message] of activity.sort((a,b)=>a[0].localeCompare(b[0])))insert('quote_activity',{quote_id:id,at:when,actor,actor_id:actorId,kind,message});
}
