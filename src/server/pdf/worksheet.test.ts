import {describe,expect,it} from 'vitest';
import {lineFloorStatus,type FloorContext} from '@/server/floors';
import {customerPdfModel,type PdfContext,type PdfQuote} from './model';
import {CONFIDENTIAL,creditUse,worksheetModel,type WorksheetFacts,type WorksheetLineFacts} from './worksheet';

// The internal worksheet's content (task 4.2, spec §6.7): the customer PDF's model as the frame,
// plus cost, margin, the floor applied, price basis, last paid, "Why this price?", credit and
// internal notes. The rendered document is checked end to end in ./internal.test.ts.

const DRAFT:PdfQuote={quote_number:'Q-24817',revision:1,draft:true,date:'2026-09-23T17:00:00.000Z',valid_until:'2026-10-07',
  customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},contact:'Dana Ortiz',rep:'Brandi Gallegos',customer_po:null,customer_note:null,
  fulfillment:'will_call',branch:'SLC',ship_to:null,
  lines:[
    {sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',qty:10,unit_price:31.5,total:315},
    {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:6,unit_price:36,total:216},
    {sku:'GLV-N8-L-1000',description:'Nitrile gloves, 8 mil, large',pack:'Case of 1,000',qty:4,unit_price:79,total:316},
    {sku:'RS-2-27-JH',description:'Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks',pack:'Each',qty:12,unit_price:22.95,total:275.4},
  ],
  subtotal:1122.4,freight:0,freight_miles:null,total:1122.4,terms:null,rep_contact:null,letterhead:null};

const CONTEXT:PdfContext={
  supplier:{name:'Herrick Industrial Supply',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0100',website:'herrickindustrial.com'},
  branch:{code:'SLC',name:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',will_call_phone:'(801) 555-0120'},
  rep:{name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},
  terms:'Net 30',
};

const FLOORS:FloorContext={repId:'brandi',repName:'Brandi Gallegos',floors:[
  {rep_id:'brandi',category_id:'fasteners',margin_floor:0.2},{rep_id:'brandi',category_id:'abrasives',margin_floor:0.25},
  {rep_id:'brandi',category_id:'safety',margin_floor:0.3},{rep_id:'brandi',category_id:'material-handling',margin_floor:0.2},
]};
const floor=(unit_price:number|null,unit_cost:number,category_id:string,category_name:string)=>lineFloorStatus({unit_price,unit_cost,category_id,category_name},FLOORS);

const LINE_FACTS:WorksheetLineFacts[]=[
  {unit_cost:21.4,cost_source:'quote',category_name:'Fasteners',basis:'last_paid',querent:{basis:'last_paid',price:31.5},last_paid:{price:31.5,date:'2026-08-12'},
    why:'Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.',floor:floor(31.5,21.4,'fasteners','Fasteners')},
  {unit_cost:24.1,cost_source:'quote',category_name:'Abrasives & Cutting',basis:'contract',querent:{basis:'contract',price:36},last_paid:{price:36,date:'2026-09-09'},
    why:'Contract price under WAS-C-2026-01, good through Dec 31, 2026.',floor:floor(36,24.1,'abrasives','Abrasives & Cutting')},
  {unit_cost:58,cost_source:'quote',category_name:'Safety & PPE',basis:'last_paid',querent:{basis:'last_paid',price:79},last_paid:{price:79,date:'2026-09-09'},
    why:'Last paid $79.00 on Sep 9, above customer price $77.50. +$6.00 GP vs customer price.',floor:floor(79,58,'safety','Safety & PPE')},
  {unit_cost:14.2,cost_source:'quote',category_name:'Material Handling & Tie-downs',basis:'customer',querent:{basis:'customer',price:22.95},last_paid:null,
    why:'Customer price. No active contract and no purchases in the last 12 months. +$0.00 GP vs customer price.',floor:floor(22.95,14.2,'material-handling','Material Handling & Tie-downs')},
];

const FACTS:WorksheetFacts={asOf:'2026-09-23T17:00:00.000Z',lines:LINE_FACTS,
  account:{terms:'Net 30',credit_limit:50000,open_balance:18420,past_due_balance:0},
  notes:[{rep_name:'Brandi Gallegos',body:'Dana is shopping the gloves price. Hold at $79.',created_at:'2026-09-23T16:40:00.000Z'},{rep_name:'Brandi Gallegos',body:'   ',created_at:'2026-09-23T16:41:00.000Z'}],
  blockers:[]};

describe('worksheetModel',()=>{
  const model=worksheetModel(DRAFT,CONTEXT,FACTS);

  it('carries everything the customer PDF prints, as its frame',()=>{
    expect(model.frame).toEqual(customerPdfModel(DRAFT,CONTEXT));
    expect(model.lines.map(l=>[l.no,l.sku,l.description,l.qty,l.unit,l.unitPrice,l.extended])).toEqual(model.frame.lines.map(l=>[l.no,l.sku,l.description,l.qty,l.unit,l.unitPrice,l.extended]));
  });

  it('is marked confidential and internal, in the banner, the file name, the title and the footer',()=>{
    expect(model.banner).toEqual({title:CONFIDENTIAL,note:'Cost and margin. Do not send to the customer.'});
    expect(CONFIDENTIAL).toBe('CONFIDENTIAL — INTERNAL');
    expect(model.title).toBe('Internal worksheet Q-24817 rev 1 (draft)');
    expect(model.filename).toBe('Herrick Industrial Supply quote Q-24817 rev 1 draft - internal worksheet.pdf');
    expect(model.footer).toEqual({left:'Herrick Industrial Supply · Quote Q-24817 rev 1 · Confidential, internal',middle:'via Querent'});
    expect(model.stamps).toEqual(['Draft · not sent','Sample data']);
  });

  it('adds cost, margin, the floor applied and the price basis to each line (the quote screen\'s margin and warning)',()=>{
    expect(model.lines.map(l=>[l.sku,l.cost,l.margin,l.floor,l.basis,l.belowFloor,l.warning,l.category])).toEqual([
      ['HCS-12-13-2G8','$21.40','32.1%','20%','Last paid',false,null,'Fasteners'],
      ['CW-45-045-T1','$24.10','33.1%','25%','Contract',false,null,'Abrasives & Cutting'],
      ['GLV-N8-L-1000','$58.00','26.6%','30%','Last paid',true,'Below Brandi\'s 30% Safety & PPE floor','Safety & PPE'],
      ['RS-2-27-JH','$14.20','38.1%','20%','Customer',false,null,'Material Handling & Tie-downs'],
    ]);
  });

  it('adds Querent\'s pick, last paid and "Why this price?" to each line',()=>{
    expect(model.lines[0].facts).toEqual(['Querent\'s pick.','Last paid $31.50 on Aug 12, 2026.']);
    expect(model.lines[3].facts).toEqual(['Querent\'s pick.','Last paid: none in the last 12 months.']);
    expect(model.lines[0].why).toBe('Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.');
  });

  it('names Querent\'s suggestion when the rep priced a line differently, and a floor that is only the default',()=>{
    const custom:PdfQuote={...DRAFT,lines:[{...DRAFT.lines[0],unit_price:29.99,total:299.9}],subtotal:299.9,total:299.9};
    const [line]=worksheetModel(custom,CONTEXT,{...FACTS,lines:[{...LINE_FACTS[0],basis:'custom',floor:lineFloorStatus({unit_price:29.99,unit_cost:21.4,category_id:'fasteners',category_name:'Fasteners'},{...FLOORS,floors:[]})}]}).lines;
    expect(line.basis).toBe('Custom');
    expect(line.margin).toBe('28.6%');
    expect(line.facts).toEqual(['Querent suggested Last paid $31.50.','Last paid $31.50 on Aug 12, 2026.','No floor set for Fasteners: the 20% default applies.']);
  });

  it('adds cost of goods, gross profit, margin and the lines below floor under the totals',()=>{
    expect(model.frame.totals.at(-1)).toMatchObject({label:'Total',value:'$1,122.40'});
    expect(model.profit).toEqual([
      {label:'Cost of goods',value:'$761.00'},
      {label:'Gross profit',value:'$361.40'},
      {label:'Margin',value:'32.2%'},
      {label:'Below floor',value:'1 of 4 lines'},
    ]);
  });

  it('leaves an unpriced line out of the margin, and shows no margin for it',()=>{
    const open:PdfQuote={...DRAFT,lines:[DRAFT.lines[0],{...DRAFT.lines[1],unit_price:null,total:null}],subtotal:315,total:315};
    const m=worksheetModel(open,CONTEXT,{...FACTS,lines:[LINE_FACTS[0],{...LINE_FACTS[1],basis:null,floor:floor(null,24.1,'abrasives','Abrasives & Cutting')}]});
    expect(m.lines[1]).toMatchObject({cost:'$24.10',margin:'—',basis:'—',belowFloor:false});
    expect(m.lines[1].facts[0]).toBe('Querent suggested Contract $36.00.');
    expect(m.profit.slice(0,3).map(r=>r.value)).toEqual(['$214.00','$101.00','32.1%']);
  });

  it('shows the open balance and credit used, with and without this quote, and warns over the limit',()=>{
    expect(model.credit).toEqual({rows:[
      {label:'Credit limit',value:'$50,000.00'},
      {label:'Open balance',value:'$18,420.00'},
      {label:'Past due',value:'$0.00'},
      {label:'Credit used',value:'37%'},
      {label:'Credit used, with this quote',value:'39%'},
    ],warning:null});
    const over=worksheetModel(DRAFT,CONTEXT,{...FACTS,account:{...FACTS.account!,open_balance:49500}});
    expect(over.credit!.rows.at(-1)).toEqual({label:'Credit used, with this quote',value:'101%'});
    expect(over.credit!.warning).toBe('Over limit by $622.40');
    const none=worksheetModel(DRAFT,CONTEXT,{...FACTS,account:{terms:null,credit_limit:null,open_balance:null,past_due_balance:null}});
    expect(none.credit).toEqual({rows:[{label:'Credit limit',value:'None on file'},{label:'Open balance',value:'—'},{label:'Past due',value:'—'}],warning:null});
    expect(worksheetModel(DRAFT,CONTEXT,{...FACTS,account:null}).credit).toBeNull();
  });

  it('prints the internal notes with who and when, dropping blank ones',()=>{
    expect(model.notes).toEqual([{meta:'Brandi Gallegos · Sep 23, 2026, 4:40 PM UTC',body:'Dana is shopping the gloves price. Hold at $79.'}]);
  });

  it('lists what blocks the send on a draft, with the below-floor warning',()=>{
    expect(model.checks).toEqual(['Nothing blocks the send.','1 line is below floor: a warning only.']);
    expect(worksheetModel(DRAFT,CONTEXT,{...FACTS,blockers:['Line 2 (CW-45-045-T1) has no price.']}).checks![0]).toBe('Line 2 (CW-45-045-T1) has no price.');
  });

  it('says a draft is live and not sent',()=>{
    expect(model.asOf).toBe('Live draft as of Sep 23, 2026, 5:00 PM UTC, not sent yet. Cost is the unit cost on the quote\'s lines; floors, credit and internal notes are current.');
  });

  it('says a sent revision is frozen, where cost comes from and as of when the live figures are',()=>{
    const sent:PdfQuote={...DRAFT,draft:false,date:'2026-09-23T17:00:00.000Z'};
    const m=worksheetModel(sent,CONTEXT,{...FACTS,asOf:'2026-09-27T02:40:00.000Z',blockers:null,lines:[{...LINE_FACTS[0],cost_source:'item'},...LINE_FACTS.slice(1)]});
    expect(m.checks).toBeNull();
    expect(m.stamps).toEqual(['Sample data']);
    expect(m.title).toBe('Internal worksheet Q-24817 rev 1');
    expect(m.filename).toBe('Herrick Industrial Supply quote Q-24817 rev 1 - internal worksheet.pdf');
    expect(m.lines[0].cost).toBe('$21.40*');
    expect(m.asOf).toBe('Q-24817 rev 1 as sent on Sep 23, 2026: quantities, prices and totals are the frozen revision the customer received. '
      +'Cost is the unit cost recorded on the quote\'s lines (* the item\'s current cost, for a line no longer on the quote). '
      +'Why this price? and last paid are as of the send date. Floors, credit and internal notes are as of Sep 27, 2026, 2:40 AM UTC.');
    expect(worksheetModel(sent,CONTEXT,{...FACTS,blockers:null}).asOf).not.toContain('*');
  });

  it('refuses facts that don\'t line up with the quote\'s lines',()=>{
    expect(()=>worksheetModel(DRAFT,CONTEXT,{...FACTS,lines:LINE_FACTS.slice(1)})).toThrow(RangeError);
  });
});

describe('creditUse',()=>{
  it('is open balance over the limit, and with this quote added',()=>{
    const use=creditUse(50000,18420,1122.4)!;
    expect(use.used).toBeCloseTo(0.3684,10);
    expect(use.withQuote).toBeCloseTo(0.390848,10);
    expect(use.overBy).toBe(0);
  });

  it('counts the part past the limit, a warning only',()=>{
    expect(creditUse(1000,900,150.25)).toMatchObject({overBy:50.25});
    expect(creditUse(1000,1000,0)).toMatchObject({withQuote:1,overBy:0});
  });

  it('is null without a positive credit limit, and treats a missing open balance as $0',()=>{
    expect(creditUse(null,100,10)).toBeNull();
    expect(creditUse(0,100,10)).toBeNull();
    expect(creditUse(Number.NaN,100,10)).toBeNull();
    expect(creditUse(1000,null,250)).toEqual({used:0,withQuote:0.25,overBy:0});
  });
});
