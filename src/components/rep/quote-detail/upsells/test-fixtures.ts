import type {ItemStock} from '@/domain';
import {upsellFingerprint,type RepUpsell} from '@/server/rep/quote-upsells';
import {ITEMS,detailLine} from '../test-fixtures';

// "Suggested by Querent" fixtures (task 3.6): the five chips GET /api/rep/quotes/Q-24817/upsells
// returns on the mockup's day (seed 2026-09-23) in scripted mode, with 1.6's template wording, and
// the items they add, shaped for ../test-fixtures' detailLine.

const stock=(sku:string,slc:number):ItemStock=>({item_id:sku,sku,total_available:slc,branches:[{branch_id:'slc',branch_code:'SLC',available:slc,on_order:0,next_receipt_on:null}]});

export const UPSELL_ITEMS={
  nut:{sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',pack:'Box of 100',case_qty:10,category_id:'fasteners',category_name:'Fasteners',
    list_price:19.95,cost:9.8,customer_price:16.5,stock:stock('HN-12-13-G8',40)},
  washer:{sku:'FW-12-G8',description:'Flat washer 1/2 in, Grade 8, yellow zinc',pack:'Box of 100',case_qty:10,category_id:'fasteners',category_name:'Fasteners',
    list_price:15.75,cost:7.4,customer_price:12.95,stock:stock('FW-12-G8',30)},
  glasses:{sku:'SG-CLR-AF',description:'Safety glasses, clear anti-fog',pack:'Box of 12',case_qty:1,category_id:'safety',category_name:'Safety & PPE',
    list_price:36,cost:18.2,customer_price:29.9,stock:stock('SG-CLR-AF',25)},
  discs:ITEMS.discs,
};
export type UpsellItemKey=keyof typeof UPSELL_ITEMS;

type Anchor='bolts'|'wheels'|'gloves';
const ANCHOR_LINES:Record<Anchor,string>={bolts:'q-24817-1',wheels:'q-24817-2',gloves:'q-24817-3'};

function chip(key:UpsellItemKey|'wheels',kind:RepUpsell['kind'],anchor:Anchor,{qty,unit_price,price_basis,gp_gain,title,reason,evidence}:
  {qty:number;unit_price:number;price_basis:RepUpsell['price_basis'];gp_gain:number;title:string;reason:string;evidence:RepUpsell['evidence']}):RepUpsell{
  const item=key==='wheels'?ITEMS.wheels:UPSELL_ITEMS[key];
  const anchorItem=ITEMS[anchor];
  const action:RepUpsell['action']=kind==='full_case'?{type:'set_qty',line_id:ANCHOR_LINES[anchor],item_id:item.sku,from_qty:6,to_qty:qty}:{type:'add_line',item_id:item.sku,qty};
  const id=`${kind}:${item.sku}`;
  return {id,fingerprint:upsellFingerprint({id,action,unit_price}),kind,action,item:{id:item.sku,sku:item.sku,description:item.description,pack:item.pack,case_qty:item.case_qty},qty,unit_price,price_basis,
    unit_cost:item.cost,gp_gain,anchor:{line_id:ANCHOR_LINES[anchor],item_id:anchorItem.sku,sku:anchorItem.sku,description:anchorItem.description},
    wording:{title,reason},evidence,wording_source:'template'} as RepUpsell;
}

const BOLT={diameter:'1/2',thread:'13',grade:'8'};
export const SAMPLE_UPSELLS:RepUpsell[]=[
  chip('nut','matching_fastener','bolts',{qty:5,unit_price:19.95,price_basis:'list',gp_gain:50.75,title:'Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)',
    reason:'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500. Bought with these bolts on all 5 orders that had them in the last 12 months.',
    evidence:{part:'nut',bolt:BOLT,bolt_pieces:500,pack_pieces:100,history:{orders_together:5,anchor_orders:5}}}),
  chip('washer','matching_fastener','bolts',{qty:5,unit_price:15.75,price_basis:'list',gp_gain:41.75,title:'Flat washer 1/2 in, Grade 8, yellow zinc (box of 100)',
    reason:'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500. Bought with these bolts on 4 of the 5 orders that had them in the last 12 months.',
    evidence:{part:'washer',bolt:BOLT,bolt_pieces:500,pack_pieces:100,history:{orders_together:4,anchor_orders:5}}}),
  chip('discs','bought_together','wheels',{qty:3,unit_price:44.25,price_basis:'contract',gp_gain:39.75,title:'Flap disc 4.5 in, 60 grit zirconia (box of 10)',
    reason:'Bought with cut-off wheels on 4 of the 5 orders that had them in the last 12 months.',evidence:{orders_together:4,anchor_orders:5}}),
  chip('wheels','full_case','wheels',{qty:8,unit_price:36,price_basis:'contract',gp_gain:23.8,title:'Bump cut-off wheels to 8 boxes (2 full cases)',
    reason:'A case holds 4 boxes, so 6 leaves a broken case.',evidence:{case_qty:4,from_qty:6,to_qty:8,cases:2}}),
  chip('glasses','bought_together','gloves',{qty:2,unit_price:29.9,price_basis:'customer',gp_gain:23.4,title:'Safety glasses, clear anti-fog (box of 12)',
    reason:'Bought with nitrile disposable gloves on 2 of the 4 orders that had them in the last 12 months.',evidence:{orders_together:2,anchor_orders:4}}),
];

/** The line a chip adds, as the server prices it (Querent's pick at the chip's qty). */
export function upsellLine(upsell:RepUpsell,n:number){
  const item=Object.values(UPSELL_ITEMS).find(i=>i.sku===upsell.item.sku)!;
  return detailLine(item,{n,qty:upsell.qty,unit_price:upsell.unit_price,price_basis:upsell.price_basis,requested_text:null,match_score:null,added_by:'upsell'});
}
