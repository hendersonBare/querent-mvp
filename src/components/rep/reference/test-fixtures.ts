import type {CustomerDirectoryRow,CustomerOrder,OrderListRow} from '@/domain';
import type {CustomerDetail,ItemDetail,ItemList,ItemRow} from '@/server/rep/reference';

// Seed-shaped data for the Customers, Orders and Items component tests (task 3.8).

export const BRANDI={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'};

export const DIRECTORY:CustomerDirectoryRow[]=[
  {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen',terms:null,credit_limit:null,open_balance:null,order_count:0,last_order_date:null,quote_count:0},
  {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos',terms:null,credit_limit:null,open_balance:null,order_count:0,last_order_date:null,quote_count:0},
  {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos',terms:'Net 30',credit_limit:50000,open_balance:18420,order_count:23,last_order_date:'2026-09-09',quote_count:25},
];

const WASATCH_ORDER={customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'};

export const ORDERS:OrderListRow[]=[
  {id:'so-51223',order_number:'SO-51223',po_number:'7777',order_date:'2026-09-09',status:'shipped',fulfillment:'delivery',branch_id:'slc',branch_code:'SLC',shipped_on:'2026-09-10',
    tracking_number:null,subtotal:592.75,freight:62.5,tax:42.97,total:698.22,quote_number:'Q-24816',...WASATCH_ORDER,line_count:3},
  {id:'so-51222',order_number:'SO-51222',po_number:'7776',order_date:'2026-08-26',status:'closed',fulfillment:'will_call',branch_id:'provo',branch_code:'Provo',shipped_on:'2026-08-26',
    tracking_number:null,subtotal:180.4,freight:0,tax:13.08,total:193.48,quote_number:null,...WASATCH_ORDER,line_count:2},
];

export const ORDER:CustomerOrder={...ORDERS[0],lines:[
  {line_no:1,item_id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:4,unit_price:36},
  {line_no:2,item_id:'GLV-N8-L-1000',sku:'GLV-N8-L-1000',description:'Nitrile disposable gloves, 8 mil, black, size L',pack:'Case of 1,000',qty:4,unit_price:79},
  {line_no:3,item_id:'FD-45-60Z',sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit zirconia',pack:'Box of 10',qty:3,unit_price:44.25},
]};

export const WASATCH_VIEW:CustomerDetail={
  account:{id:'wasatch',account_number:'WAS-1142',name:'Wasatch Mechanical Contractors',terms:'Net 30',credit_limit:50000,open_balance:18420,past_due_balance:0,
    tax_status:'taxable',tax_state:'UT',price_level_id:'contractor-2',main_phone:'(801) 555-0148',
    ship_to:{name:'Wasatch Mechanical Contractors, main yard',address:'1800 W 10950 S',city:'South Jordan',state:'UT',zip:'84095',lat:40.5513,lng:-111.933},rep:BRANDI},
  on_file:true,credit_used:0.3684,
  contacts:[{id:'dana',customer_id:'wasatch',name:'Dana Ortiz',title:'Purchasing',phone:'(801) 555-0142',email:'dana.ortiz@wasatchmechanical.example',is_primary:true}],
  win_rate:17/24,quotes_won:17,quotes_decided:24,
  orders:{count:23,recent:ORDERS},
  quotes:{count:25,recent:[
    {id:'q-24817',quote_number:'Q-24817',revision:0,status:'ready_for_review',requested_at:'2026-09-23T16:14:00.000Z',sent_total:null,rep_name:'Brandi Gallegos',line_count:4},
    {id:'q-24816',quote_number:'Q-24816',revision:1,status:'accepted',requested_at:'2026-09-07T21:20:00.000Z',sent_total:655.25,rep_name:'Brandi Gallegos',line_count:3},
    {id:'q-24815',quote_number:'Q-24815',revision:1,status:'expired',requested_at:'2026-09-02T21:00:00.000Z',sent_total:322.8,rep_name:'Brandi Gallegos',line_count:2},
  ]},
};

export const GREAT_BASIN_VIEW:CustomerDetail={
  account:{id:'great-basin',account_number:'GBF-2207',name:'Great Basin Fabrication',terms:null,credit_limit:null,open_balance:null,past_due_balance:null,tax_status:null,tax_state:null,
    price_level_id:null,main_phone:null,ship_to:null,rep:BRANDI},
  on_file:false,credit_used:null,contacts:[],win_rate:null,quotes_won:0,quotes_decided:0,
  orders:{count:0,recent:[]},quotes:{count:0,recent:[]},
};

const stock=(slc:number,ogden:number,provo:number,onOrderProvo=0)=>[
  {branch_id:'slc',branch_code:'SLC',available:slc,on_order:0,next_receipt_on:null},
  {branch_id:'ogden',branch_code:'Ogden',available:ogden,on_order:0,next_receipt_on:null},
  {branch_id:'provo',branch_code:'Provo',available:provo,on_order:onOrderProvo,next_receipt_on:onOrderProvo?'2026-09-26':null},
];

export const BOLTS:ItemRow={id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',category_id:'fasteners',category_name:'Fasteners',
  pack:'Box of 50',case_qty:10,list_price:38.95,stock:stock(64,22,8),total_available:94};
export const STRAPS:ItemRow={id:'RS-2-27-JH',sku:'RS-2-27-JH',description:'Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks',category_id:'material-handling',category_name:'Material Handling & Tie-downs',
  pack:'Each',case_qty:12,list_price:28.5,stock:stock(7,20,0,24),total_available:27};

const BRANCHES=[{id:'slc',code:'SLC'},{id:'ogden',code:'Ogden'},{id:'provo',code:'Provo'}];

export const ITEM_LIST:ItemList={
  branches:BRANCHES,
  categories:[{id:'fasteners',name:'Fasteners',sort_order:1,count:1},{id:'material-handling',name:'Material Handling & Tie-downs',sort_order:4,count:1}],
  category:null,
  items:[BOLTS,STRAPS],
};

export const BOLTS_VIEW:ItemDetail={
  item:BOLTS,
  branches:[{id:'slc',code:'SLC',name:'Salt Lake City'},{id:'ogden',code:'Ogden',name:'Ogden'},{id:'provo',code:'Provo',name:'Provo'}],
  sales:[
    {order_id:'so-51221',order_number:'SO-51221',order_date:'2026-08-12',customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',qty:10,unit_price:31.5},
    {order_id:'so-51213',order_number:'SO-51213',order_date:'2026-04-21',customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',qty:12,unit_price:30.4},
  ],
};
