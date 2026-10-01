import type {CategoryId} from './catalog';

// BOXT Packaging, as boxtpackaging.com describes it: one headquarters and will-call counter in
// Spanish Fork, its own delivery truck across the Wasatch Front (free at $1,000+, a flat $100
// under, inside an 85-mile radius), Net 30 for qualifying accounts. Landon, Eli and Keenan are
// BOXT's reps. The customers are fictional: addresses at real approximate coordinates, phone
// numbers in the 555-01xx range reserved for fiction, and .example email domains.

export const SUPPLIER={id:'boxt',name:'BOXT Packaging',address:'587 W 1000 N',city:'Spanish Fork',state:'UT',zip:'84660',phone:'(385) 327-3166',email:'hello@boxtpackaging.com',website:'boxtpackaging.com'};

export const SETTINGS:Record<string,string>={scarcity_uplift_enabled:'false'};

export const BRANCHES=[
  {id:'spanish-fork',code:'Spanish Fork',name:'Spanish Fork',address:'587 W 1000 N',city:'Spanish Fork',state:'UT',zip:'84660',lat:40.1286,lng:-111.6655,phone:'(385) 327-3166',hours:'Mon–Fri 9:00 AM–5:00 PM'},
] as const;
export type BranchId=typeof BRANCHES[number]['id'];

export const REPS=[
  {id:'landon',name:'Landon Richards',initials:'LR',title:'Account Executive',phone:'(385) 327-3166',email:'landon@boxtpackaging.com'},
  {id:'eli',name:'Eli',initials:'E',title:'Account Rep',phone:'(385) 327-3166',email:'eli@boxtpackaging.com'},
  {id:'keenan',name:'Keenan',initials:'K',title:'Account Rep',phone:'(385) 327-3166',email:'keenan@boxtpackaging.com'},
];

// Every rep x category floor is 20% (spec §5.2) except a few of Landon's, so the red
// below-floor warning is easy to demo: the labels line on Q-24817 (23.3%) sits under his 25% Labels floor.
export const DEFAULT_FLOOR=0.2;
export const LANDON_FLOORS:Partial<Record<CategoryId,number>>={labels:0.25,'stretch-wrap':0.22,boxes:0.18};

export const DEPARTMENTS=[
  {id:'customer-service',name:'Customer Service',branch_id:null,phone:SUPPLIER.phone,email:SUPPLIER.email,hours:'Mon–Fri 9:00 AM–5:00 PM MT'},
  ...BRANCHES.map(b=>({id:`will-call-${b.id}`,name:`Warehouse / Will-call · ${b.code}`,branch_id:b.id as string|null,phone:b.phone,email:null as string|null,hours:b.hours})),
];

// Local delivery on BOXT's own truck (boxtpackaging.com/pages/free-freight-zones-shipping): free at
// $1,000+, a flat $100 under, Ogden to Nephi. The 85-mile radius is straight-line, so road factor 1.
export const DELIVERY_RATES={id:'default',base_fee:100,per_mile:0,min_charge:100,free_threshold:1000,max_radius_miles:85,road_factor:1};

// BOXT prices by bundle, pallet, multi-pallet and truckload tiers; the 3PL buys at pallet tier.
export const PRICE_LEVEL={id:'pallet-tier',code:'PLT',name:'Pallet tier'};

// A Utah County 3PL about 15 mi up I-15 from Spanish Fork: delivery is $100 under $1,000, free over.
export const CUSTOMER={id:'timpanogos',account_number:'TFC-1142',name:'Timpanogos Fulfillment Co.',terms:'Net 30',credit_limit:40000,open_balance:12860,past_due_balance:0,tax_status:'taxable',tax_state:'UT',price_level_id:PRICE_LEVEL.id,main_phone:'(801) 555-0148',ship_to_name:'Timpanogos Fulfillment Co., Lindon warehouse',ship_to_address:'1250 W 200 S',ship_to_city:'Lindon',ship_to_state:'UT',ship_to_zip:'84042',ship_to_lat:40.3394,ship_to_lng:-111.7395};
export const CONTACT={id:'megan',customer_id:CUSTOMER.id,name:'Megan Hale',title:'Purchasing Manager',phone:'(801) 555-0142',email:'megan.hale@timpanogosfulfillment.example',is_primary:1};
export const CUSTOMER_REP='landon';
export const TAX_RATE=0.0725;

// Placeholders exist so the customer picker, Customers list and Rep assignments show
// several customers. They have no orders, quotes, prices or logs (spec §2).
export const PLACEHOLDER_CUSTOMERS=[
  {id:'red-ledge',account_number:'RLO-2207',name:'Red Ledge Outdoor Supply',rep:'landon'},
  {id:'provo-canyon',account_number:'PCC-3318',name:'Provo Canyon Coffee Roasters',rep:'eli'},
  {id:'saltair',account_number:'SWD-4051',name:'Saltair Warehouse & Distribution',rep:'keenan'},
];

/** Contract windows are day offsets from the anchor (anchor 2026-09-23 gives Jan 1 to Dec 31, 2026). */
export const CONTRACTS=[
  {id:'timpanogos-2026-film-tape',contract_number:'TFC-C-2026-01',name:'Stretch wrap & tape supply agreement',starts:-265,ends:99,lines:[['SF188CAST',69.95],['SF188',79.5],['MSF2080B',106.0],['T902400',69.95],['T903700',129.5]] as [string,number][]},
  {id:'timpanogos-2025-labels',contract_number:'TFC-C-2025-02',name:'Shipping labels agreement (expired)',starts:-630,ends:-266,lines:[['THL576',158.0],['THD114',112.0]] as [string,number][]},
];
