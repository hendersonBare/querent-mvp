import {describe,expect,it} from 'vitest';
import type {Quote,QuoteLine,QuoteSnapshot} from '@/domain';
import type {QuoteFreight} from '@/server/freight/engine';
import {fromDraft} from './draft';
import {customerPdfModel,fromSnapshot,type PdfContext} from './model';

// The customer PDF's content (task 4.1, spec §6.7): every string it prints, built only from
// customer fields. The rendered document is checked end to end in render.test.tsx.

const SNAPSHOT:QuoteSnapshot={quote_number:'Q-24816',revision:1,sent_at:'2026-09-09T16:20:00.000Z',customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},
  contact:'Dana Ortiz',rep:'Brandi Gallegos',fulfillment:'delivery',branch:'SLC',ship_to:'1800 W 10950 S, South Jordan, UT 84095',valid_days:14,valid_until:'2026-09-23',
  customer_po:null,customer_note:'Deliver to the north gate.',subtotal:592.75,freight:62.5,freight_miles:15,total:655.25,
  lines:[
    {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:4,unit_price:36,total:144},
    {sku:'GLV-N8-L-1000',description:'Nitrile gloves, 8 mil, large',pack:'Case of 1000',qty:4,unit_price:79,total:316},
    {sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit',pack:'Box of 10',qty:3,unit_price:44.25,total:132.75},
  ]};

const CONTEXT:PdfContext={
  supplier:{name:'Herrick Industrial Supply',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0100',website:'herrickindustrial.com'},
  branch:{code:'SLC',name:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',will_call_phone:'(801) 555-0120'},
  rep:{name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},
  terms:'Net 30',
};

/** Every key path whose key looks internal (the same scan as the customer repository guard). */
function leaks(value:unknown,path='$'):string[]{
  if(Array.isArray(value))return value.flatMap((v,i)=>leaks(v,`${path}[${i}]`));
  if(value&&typeof value==='object')return Object.entries(value).flatMap(([k,v])=>[...(/cost|margin|floor|suggest|explanation|internal|basis/i.test(k)?[`${path}.${k}`]:[]),...leaks(v,`${path}.${k}`)]);
  return [];
}

describe('fromSnapshot',()=>{
  it('copies only the customer fields of a sent revision, whatever else the stored snapshot holds',()=>{
    const leaky={...SNAPSHOT,internal_notes:'Margin is thin',lines:SNAPSHOT.lines.map(l=>({...l,unit_cost:24.1,margin:0.33,explanation:'Contract price'}))} as unknown as QuoteSnapshot;
    const source=fromSnapshot(leaky,'2026-09-09T16:20:00.000Z');
    expect(leaks(source)).toEqual([]);
    expect(JSON.stringify(source)).not.toMatch(/24\.1|Margin|Contract price|internal/);
    expect(source).toMatchObject({quote_number:'Q-24816',revision:1,draft:false,date:'2026-09-09T16:20:00.000Z',freight:62.5,freight_miles:15,total:655.25});
  });

  it('dates a snapshot stored before task 1.5 by its revision row, and has no miles or ship-to for it',()=>{
    const {sent_at:_sentAt,ship_to:_shipTo,freight_miles:_miles,customer_po:_po,customer_note:_note,valid_days:_days,...legacy}=SNAPSHOT;
    expect(fromSnapshot(legacy,'2026-09-09T17:00:00.000Z')).toMatchObject({date:'2026-09-09T17:00:00.000Z',ship_to:null,freight_miles:null,customer_po:null,customer_note:null});
  });
});

describe('customerPdfModel',()=>{
  const model=customerPdfModel(fromSnapshot(SNAPSHOT,SNAPSHOT.sent_at!),CONTEXT);

  it('heads the page with Herrick, the quote\'s branch address and phone',()=>{
    expect(model.supplier).toEqual({name:'Herrick Industrial Supply',branch:'Salt Lake City branch',address:['1480 W 2100 S','Salt Lake City, UT 84119'],phone:'(801) 555-0120',website:'herrickindustrial.com'});
  });

  it('shows the quote number with its revision, the date, valid until, customer, account and PO',()=>{
    expect(model.quote).toEqual({number:'Q-24816',revision:'Rev 1',date:'Sep 9, 2026',validUntil:'Sep 23, 2026'});
    expect(model.customer).toEqual({name:'Wasatch Mechanical Contractors',attention:'Attn: Dana Ortiz',account:'Account WAS-1142'});
    expect(model.details).toEqual([
      {label:'Quote number',value:'Q-24816 rev 1'},
      {label:'Date',value:'Sep 9, 2026'},
      {label:'Valid until',value:'Sep 23, 2026'},
      {label:'Customer PO',value:'To be added'},
      {label:'Terms',value:'Net 30'},
      {label:'Sales rep',value:'Brandi Gallegos'},
    ]);
    expect(customerPdfModel({...fromSnapshot(SNAPSHOT,SNAPSHOT.sent_at!),customer_po:'7781'},CONTEXT).details).toContainEqual({label:'Customer PO',value:'7781'});
  });

  it('lists each line with SKU, description, qty, unit, unit price and extended',()=>{
    expect(model.lines).toEqual([
      {no:'1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',qty:'4',unit:'Box of 25',unitPrice:'$36.00',extended:'$144.00'},
      {no:'2',sku:'GLV-N8-L-1000',description:'Nitrile gloves, 8 mil, large',qty:'4',unit:'Case of 1000',unitPrice:'$79.00',extended:'$316.00'},
      {no:'3',sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit',qty:'3',unit:'Box of 10',unitPrice:'$44.25',extended:'$132.75'},
    ]);
  });

  it('prints unit prices past the cent as they were quoted, and extended amounts to the cent',()=>{
    const source=fromSnapshot({...SNAPSHOT,lines:[{sku:'X-1',description:'Rivet',pack:'Each',qty:1200,unit_price:0.0825,total:99}]},SNAPSHOT.sent_at!);
    expect(customerPdfModel(source,CONTEXT).lines[0]).toMatchObject({qty:'1,200',unitPrice:'$0.0825',extended:'$99.00'});
  });

  it('totals: subtotal, freight with the miles, "added on invoice" sales tax, total',()=>{
    expect(model.totals).toEqual([
      {label:'Subtotal',detail:null,value:'$592.75'},
      {label:'Freight',detail:'Delivery from SLC, 15.0 mi',value:'$62.50'},
      {label:'Sales tax',detail:null,value:'Added on invoice'},
      {label:'Total',detail:null,value:'$655.25',strong:true},
    ]);
  });

  it('names will call instead of miles, and delivery without miles on older revisions',()=>{
    const willCall=customerPdfModel({...fromSnapshot(SNAPSHOT,SNAPSHOT.sent_at!),fulfillment:'will_call',ship_to:null,freight:0,freight_miles:null},CONTEXT);
    expect(willCall.totals[1]).toEqual({label:'Freight',detail:'Will call at SLC',value:'$0.00'});
    expect(willCall.fulfillment).toEqual({label:'Will call',lines:['Pick up at Salt Lake City branch','1480 W 2100 S, Salt Lake City, UT 84119']});
    const older=customerPdfModel({...fromSnapshot(SNAPSHOT,SNAPSHOT.sent_at!),freight_miles:null},CONTEXT);
    expect(older.totals[1]).toEqual({label:'Freight',detail:'Delivery from SLC',value:'$62.50'});
    expect(model.fulfillment).toEqual({label:'Delivery',lines:['Ship to','1800 W 10950 S, South Jordan, UT 84095']});
  });

  it('prints the note on the quote, the terms, and the rep\'s contact',()=>{
    expect(model.note).toBe('Deliver to the north gate.');
    expect(model.terms).toEqual(['Payment terms: Net 30.','Prices valid until Sep 23, 2026, subject to stock at the time of order.','Sales tax added on invoice.']);
    expect(model.rep).toEqual({name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'});
    expect(customerPdfModel({...fromSnapshot(SNAPSHOT,SNAPSHOT.sent_at!),customer_note:'  '},CONTEXT).note).toBeNull();
  });

  it('prints the terms, rep contact and letterhead frozen at send, not the live records (spec §5.4)',()=>{
    const frozen:QuoteSnapshot={...SNAPSHOT,terms:'Net 30',
      rep_contact:{name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},
      letterhead:{supplier:'Herrick Industrial Supply',website:'herrickindustrial.com',branch:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0120'}};
    const live:PdfContext={supplier:{...CONTEXT.supplier,name:'Herrick Supply Co.',website:'herrick.example'},
      branch:{...CONTEXT.branch!,name:'Downtown SLC',address:'200 N Main St',will_call_phone:'(801) 555-0177'},
      rep:{name:'Brandi Gallegos',title:'Branch Sales',phone:'(801) 555-0199',email:'bg@herrick.example'},terms:'Net 45'};
    const model=customerPdfModel(fromSnapshot(frozen,frozen.sent_at!),live);
    expect(model.supplier).toEqual({name:'Herrick Industrial Supply',branch:'Salt Lake City branch',address:['1480 W 2100 S','Salt Lake City, UT 84119'],phone:'(801) 555-0120',website:'herrickindustrial.com'});
    expect(model.details).toContainEqual({label:'Terms',value:'Net 30'});
    expect(model.terms[0]).toBe('Payment terms: Net 30.');
    expect(model.rep).toEqual({name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'});
    expect(model.footer.left).toBe('Herrick Industrial Supply · Quote Q-24816 rev 1');
    expect(JSON.stringify(model)).not.toMatch(/Net 45|555-0199|555-0177|200 N Main|Downtown|Branch Sales|herrick\.example|Supply Co/);
    // A snapshot stored before these were frozen prints the live records.
    const older=customerPdfModel(fromSnapshot(SNAPSHOT,SNAPSHOT.sent_at!),live);
    expect(older.details).toContainEqual({label:'Terms',value:'Net 45'});
    expect(older.rep.phone).toBe('(801) 555-0199');
    expect(older.supplier).toMatchObject({branch:'Downtown SLC branch',address:['200 N Main St','Salt Lake City, UT 84119'],phone:'(801) 555-0177'});
  });

  it('falls back to the snapshot\'s rep name, Net 30 and Herrick\'s own address when the context lacks them',()=>{
    const bare=customerPdfModel(fromSnapshot(SNAPSHOT,SNAPSHOT.sent_at!),{...CONTEXT,branch:null,rep:null,terms:null});
    expect(bare.rep).toEqual({name:'Brandi Gallegos',title:null,phone:null,email:null});
    expect(bare.details).toContainEqual({label:'Terms',value:'Net 30'});
    expect(bare.supplier).toMatchObject({branch:null,address:['1480 W 2100 S','Salt Lake City, UT 84119'],phone:'(801) 555-0100'});
  });

  it('marks every page "via Querent" and "Sample data", and names the file after the quote and revision',()=>{
    expect(model.footer).toEqual({left:'Herrick Industrial Supply · Quote Q-24816 rev 1',via:'via Querent',sample:'Sample data'});
    expect(model.title).toBe('Quote Q-24816 rev 1');
    expect(model.filename).toBe('Herrick Industrial Supply quote Q-24816 rev 1.pdf');
    expect(model.draft).toBe(false);
  });

  it('carries no cost, margin, floor, basis or Querent reasoning',()=>{
    expect(leaks(model)).toEqual([]);
    expect(JSON.stringify(model)).not.toMatch(/cost|margin|floor|\bGP\b|suggest|why this price|Querent found/i);
  });
});

describe('fromDraft (the rep\'s preview of an unsent draft)',()=>{
  const line=(n:number,qty:number,unit_price:number|null):QuoteLine=>({id:`q-1-${n}`,quote_id:'q-1',line_no:n,item_id:`SKU-${n}`,sku:`SKU-${n}`,description:`Item ${n}`,pack:'Each',case_qty:1,
    category_id:'fasteners',category_name:'Fasteners',list_price:99,qty,unit_price,price_basis:'custom',suggested_price:1,suggested_basis:'customer',customer_price:1,unit_cost:0.5,freight_recovery:0,
    explanation:'Last paid $1.00 on Aug 12. +$5.50 GP vs customer price.',requested_text:'bolts',match_score:0.9,added_by:'querent'});
  const DRAFT:Quote={id:'q-1',quote_number:'Q-1',customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',contact_id:'dana',contact_name:'Dana Ortiz',
    rep_id:'brandi',rep_name:'Brandi Gallegos',status:'changes_requested',revision:1,conversation_id:null,request_text:'Need bolts',requested_at:'2026-09-23T16:14:00.000Z',created_at:'2026-09-23T16:15:00.000Z',
    updated_at:'2026-09-24T16:15:00.000Z',sent_at:'2026-09-23T17:00:00.000Z',responded_at:null,fulfillment:'delivery',branch_id:'slc',branch_code:'SLC',requested_date:null,fulfillment_time:null,
    ship_to_address:'1800 W 10950 S, South Jordan, UT 84095',ship_to_lat:40.55,ship_to_lng:-111.93,freight_override:null,freight_override_reason:null,freight_rate_bp:null,freight_ramp_step:null,freight_ramp_steps:null,modelled_freight_cents:null,valid_days:14,expires_on:null,valid_until:'2026-10-07',
    customer_po:'7781',customer_note:'Call on arrival.',change_request_note:'Can you do 20 boxes?',unread_for_rep:true,unread_for_customer:false,is_sample:false,duplicated_from:null,
    lines:[line(1,20,31.5),line(2,3,null)]};
  const FREIGHT:QuoteFreight={computed:{rule:'distance',amount:62.5,miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50',explanation:'15.0 mi from SLC'},override:null,amount:62.5,source:'computed',unresolved:false};
  const NOW='2026-09-24T18:00:00.000Z';

  it('previews the next revision, dated now and valid for the quote\'s days, with the draft\'s customer fields only',()=>{
    const source=fromDraft(DRAFT,FREIGHT,NOW);
    expect(source).toEqual({quote_number:'Q-1',revision:2,draft:true,date:NOW,valid_until:'2026-10-08',customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},contact:'Dana Ortiz',
      rep:'Brandi Gallegos',customer_po:'7781',customer_note:'Call on arrival.',fulfillment:'delivery',branch:'SLC',ship_to:'1800 W 10950 S, South Jordan, UT 84095',
      lines:[{sku:'SKU-1',description:'Item 1',pack:'Each',qty:20,unit_price:31.5,total:630},{sku:'SKU-2',description:'Item 2',pack:'Each',qty:3,unit_price:null,total:null}],
      subtotal:630,freight:62.5,freight_miles:15,total:692.5,terms:null,rep_contact:null,letterhead:null});
    expect(JSON.stringify(source)).not.toMatch(/\b0\.5\b|GP|Last paid|Can you do|Need bolts|"custom"/);
  });

  it('shows an unpriced line and call-for-freight as still open, with no total',()=>{
    const open=customerPdfModel(fromDraft(DRAFT,{...FREIGHT,amount:'call_for_freight',unresolved:true,computed:{...FREIGHT.computed,rule:'beyond_radius',amount:'call_for_freight'}},NOW),CONTEXT);
    expect(open.lines[1]).toMatchObject({unitPrice:'—',extended:'—'});
    expect(open.totals).toEqual([
      {label:'Subtotal',detail:null,value:'$630.00'},
      {label:'Freight',detail:'Delivery from SLC, 15.0 mi',value:'Call for freight'},
      {label:'Sales tax',detail:null,value:'Added on invoice'},
      {label:'Total',detail:null,value:'To be confirmed',strong:true},
    ]);
  });

  it('is marked as a draft preview, in the file name too',()=>{
    const model=customerPdfModel(fromDraft(DRAFT,FREIGHT,NOW),CONTEXT);
    expect(model).toMatchObject({draft:true,title:'Quote Q-1 rev 2 (draft preview)',filename:'Herrick Industrial Supply quote Q-1 rev 2 draft.pdf'});
    expect(model.quote).toEqual({number:'Q-1',revision:'Rev 2',date:'Sep 24, 2026',validUntil:'Oct 8, 2026'});
  });

  it('has no ship-to on will call, and drops the freight miles there',()=>{
    const willCall=fromDraft({...DRAFT,fulfillment:'will_call'},{...FREIGHT,amount:0,computed:{rule:'will_call',amount:0,miles:null,formula:null,explanation:'Will call'}},NOW);
    expect(willCall).toMatchObject({ship_to:null,freight:0,freight_miles:null,total:630});
  });
});
