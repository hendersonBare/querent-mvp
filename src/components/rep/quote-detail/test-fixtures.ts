import type {ItemStock,PriceSources,QuoteLine} from '@/domain';
import type {FloorRow} from '@/server/floors';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import type {DetailLine} from '@/server/rep/quote-math';
import {SAMPLE_PANELS} from './panels/test-fixtures';

// Quote detail fixtures for unit and component tests (task 3.3): the seeded sample Q-24817 as
// GET /api/rep/quotes/Q-24817 returns it on the mockup's day (seed 2026-09-23), priced by the
// 1.1 engine: bolts at last paid, wheels on contract, gloves at last paid (under Brandi's 30%
// PPE floor), straps at customer price. Items $1,122.40, will call at SLC.

export const PRICING_DAY='2026-09-23';
export const AS_OF='2026-09-25T18:00:00.000Z';

export const FLOORS:FloorRow[]=[
  {rep_id:'brandi',category_id:'fasteners',margin_floor:0.2},
  {rep_id:'brandi',category_id:'abrasives',margin_floor:0.25},
  {rep_id:'brandi',category_id:'safety',margin_floor:0.3},
  {rep_id:'brandi',category_id:'material-handling',margin_floor:0.2},
  {rep_id:'brandi',category_id:'tools',margin_floor:0.18},
  {rep_id:'brandi',category_id:'janitorial',margin_floor:0.2},
];
const floorOf=(category:string)=>FLOORS.find(f=>f.category_id===category)!.margin_floor;

const stock=(item_id:string,[slc,ogden,provo]:[number,number,number],onOrder:[number,string|null]=[0,null]):ItemStock=>({item_id,sku:item_id,total_available:slc+ogden+provo,branches:[
  {branch_id:'slc',branch_code:'SLC',available:slc,on_order:onOrder[0],next_receipt_on:onOrder[1]},
  {branch_id:'ogden',branch_code:'Ogden',available:ogden,on_order:0,next_receipt_on:null},
  {branch_id:'provo',branch_code:'Provo',available:provo,on_order:0,next_receipt_on:null},
]});

interface ItemFacts {sku:string;description:string;pack:string;case_qty:number;category_id:string;category_name:string;list_price:number;cost:number;customer_price:number|null;
  contract?:PriceSources['contract'];last_paid?:PriceSources['last_paid'];stock:ItemStock}

export const ITEMS:Record<'bolts'|'wheels'|'gloves'|'straps'|'discs',ItemFacts>={
  bolts:{sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',case_qty:10,category_id:'fasteners',category_name:'Fasteners',
    list_price:38.95,cost:21.4,customer_price:30.95,last_paid:{unit_price:31.5,qty:10,order_date:'2026-08-12',order_number:'SO-88412'},stock:stock('HCS-12-13-2G8',[64,22,8])},
  wheels:{sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',case_qty:4,category_id:'abrasives',category_name:'Abrasives & Cutting',
    list_price:46,cost:24.1,customer_price:38.95,
    contract:{contract_id:'c-was-2026',contract_number:'WAS-C-2026-01',contract_name:'Wasatch 2026 abrasives',unit_price:36,starts_on:'2026-01-01',ends_on:'2026-12-31'},
    last_paid:{unit_price:36,qty:4,order_date:'2026-09-09',order_number:'SO-88590'},stock:stock('CW-45-045-T1',[140,60,35])},
  gloves:{sku:'GLV-N8-L-1000',description:'Nitrile disposable gloves, 8 mil, black, size L',pack:'Case of 1,000',case_qty:1,category_id:'safety',category_name:'Safety & PPE',
    list_price:94,cost:58,customer_price:77.5,last_paid:{unit_price:79,qty:4,order_date:'2026-09-09',order_number:'SO-88590'},stock:stock('GLV-N8-L-1000',[9,14,3],[12,'2026-09-28'])},
  straps:{sku:'RS-2-27-JH',description:'Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks',pack:'Each',case_qty:10,category_id:'material-handling',category_name:'Material Handling & Tie-downs',
    list_price:28.5,cost:14.2,customer_price:22.95,stock:stock('RS-2-27-JH',[7,20,0],[24,'2026-09-26'])},
  discs:{sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit zirconia',pack:'Box of 10',case_qty:5,category_id:'abrasives',category_name:'Abrasives & Cutting',
    list_price:52.5,cost:31,customer_price:47.5,stock:stock('FD-45-60Z',[52,18,9])},
};

/** One detail line for `item`, priced as given (defaults: Querent's pick stored as the price). */
export function detailLine(item:ItemFacts,{n,qty,unit_price,price_basis,suggested_price=unit_price,suggested_basis=price_basis,requested_text=null,match_score=0.92,added_by='querent'}:{
  n:number;qty:number;unit_price:number|null;price_basis:QuoteLine['price_basis'];suggested_price?:number|null;suggested_basis?:QuoteLine['price_basis'];
  requested_text?:string|null;match_score?:number|null;added_by?:QuoteLine['added_by']}):DetailLine{
  const sources:PriceSources={item_id:item.sku,sku:item.sku,list_price:item.list_price,customer_price:item.customer_price,contract:item.contract??null,
    cost:item.cost,case_qty:item.case_qty,category_id:item.category_id,last_paid:item.last_paid??null};
  return {id:`q-24817-${n}`,quote_id:'q-24817',line_no:n,item_id:item.sku,sku:item.sku,description:item.description,pack:item.pack,case_qty:item.case_qty,
    category_id:item.category_id,category_name:item.category_name,list_price:item.list_price,qty,unit_price,price_basis,suggested_price,suggested_basis,
    customer_price:item.customer_price,unit_cost:item.cost,explanation:null,requested_text,match_score,added_by,
    pricing:{sources,branchId:'slc',stock:item.stock,scarcityEnabled:false,floor:floorOf(item.category_id),on:PRICING_DAY}};
}

export const SAMPLE_LINES:DetailLine[]=[
  detailLine(ITEMS.bolts,{n:1,qty:10,unit_price:31.5,price_basis:'last_paid',requested_text:'1/2 in grade 8 hex bolts, 10 boxes'}),
  detailLine(ITEMS.wheels,{n:2,qty:6,unit_price:36,price_basis:'contract',requested_text:'the usual cut-off wheels',match_score:0.95}),
  detailLine(ITEMS.gloves,{n:3,qty:4,unit_price:79,price_basis:'last_paid',requested_text:'the usual gloves',match_score:0.93}),
  detailLine(ITEMS.straps,{n:4,qty:12,unit_price:22.95,price_basis:'customer',requested_text:'2 in ratchet straps, maybe 12 (then: 27 ft with J-hooks)',match_score:0.9}),
];

export const REQUEST='Do you have the 1/2 in grade 8 hex bolts in stock? Need 10 boxes plus the usual cut-off wheels and gloves. Also need 2 in ratchet straps, maybe 12. Can we pick up Thursday at the SLC branch?';

/** The sample as the detail API returns it; `overrides` replace top-level fields, `quote` fields merge. */
export function sampleDetail({quote,...overrides}:Partial<Omit<QuoteDetail,'quote'>>&{quote?:Partial<QuoteDetail['quote']>}={}):QuoteDetail{
  return {
    as_of:AS_OF,
    quote:{id:'q-24817',quote_number:'Q-24817',customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',contact_id:'dana',contact_name:'Dana Ortiz',
      contact_title:'Purchasing',rep_id:'brandi',rep_name:'Brandi Gallegos',status:'ready_for_review',revision:0,conversation_id:'conv-q-24817',request_text:REQUEST,
      requested_at:'2026-09-23T16:14:00.000Z',created_at:'2026-09-23T16:15:00.000Z',updated_at:'2026-09-23T16:15:00.000Z',sent_at:null,responded_at:null,
      fulfillment:'will_call',branch_id:'slc',branch_code:'SLC',requested_date:'2026-09-24',fulfillment_time:null,ship_to_address:'1800 W 10950 S, South Jordan, UT 84095',
      ship_to_lat:40.5513,ship_to_lng:-111.933,freight_override:null,freight_override_reason:null,valid_days:14,valid_until:null,expires_on:null,customer_po:null,customer_note:null,
      change_request_note:null,unread_for_rep:true,unread_for_customer:false,is_sample:true,duplicated_from:null,...quote},
    valid_until:'2026-10-09',
    editable:true,
    lines:SAMPLE_LINES,
    floors:FLOORS,
    freight:{computed:{rule:'will_call',amount:0,miles:null,formula:null,explanation:'Will call at SLC: no freight.'},override:null,amount:0,source:'computed',unresolved:false},
    delivery_rates:{base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25},
    send_check:{can_send:true,status_problem:null,blockers:[],below_floor_count:1,subtotal:1122.4,total:1122.4,revision:1},
    panels:SAMPLE_PANELS,
    ...overrides,
  };
}
