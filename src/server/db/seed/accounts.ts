import type {CategoryId} from './catalog';

// Fictional addresses at real approximate coordinates. Phone numbers use the 555-01xx
// range reserved for fiction. Brandi's phone and email are the ones set for the Herrick demo.

export const SUPPLIER={id:'herrick',name:'Herrick Industrial Supply',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0100',email:'sales@herrickindustrial.com',website:'herrickindustrial.com'};

export const SETTINGS:Record<string,string>={scarcity_uplift_enabled:'false'};

export const BRANCHES=[
  {id:'slc',code:'SLC',name:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',lat:40.725,lng:-111.933,phone:'(801) 555-0120',hours:'Mon–Fri 6:30 AM–5:00 PM'},
  {id:'ogden',code:'Ogden',name:'Ogden',address:'2330 Wall Ave',city:'Ogden',state:'UT',zip:'84401',lat:41.222,lng:-111.979,phone:'(801) 555-0130',hours:'Mon–Fri 7:00 AM–4:30 PM'},
  {id:'provo',code:'Provo',name:'Provo',address:'1600 S Industrial Pkwy',city:'Provo',state:'UT',zip:'84606',lat:40.215,lng:-111.656,phone:'(801) 555-0140',hours:'Mon–Fri 7:00 AM–4:30 PM'},
] as const;
export type BranchId=typeof BRANCHES[number]['id'];

// role and team (v3 spec §8, decision 20; task D1): Brandi is the manager and keeps her own book; the
// team label is a free-text filter.
export const REPS=[
  {id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com',role:'manager',team:'Inside Sales'},
  {id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com',role:'rep',team:'Inside Sales'},
  {id:'eli',name:'Eli Porter',initials:'EP',title:'Outside Sales',phone:'(801) 555-0103',email:'eli.porter@herrickindustrial.com',role:'rep',team:'Outside Sales'},
  {id:'nora',name:'Nora Chen',initials:'NC',title:'Account Manager',phone:'(801) 555-0104',email:'nora.chen@herrickindustrial.com',role:'rep',team:'Outside Sales'},
];

// Every rep x category floor is 20% (spec §5.2) except a few of Brandi's, so the red
// below-floor warning is easy to demo: the gloves line on Q-24817 (26.6%) sits under her 30% PPE floor.
export const DEFAULT_FLOOR=0.2;
export const BRANDI_FLOORS:Partial<Record<CategoryId,number>>={abrasives:0.25,safety:0.3,tools:0.18};

export const DEPARTMENTS=[
  {id:'customer-service',name:'Customer Service',branch_id:null,phone:'(801) 555-0110',email:'customerservice@herrickindustrial.com',hours:'Mon–Fri 7:00 AM–5:00 PM'},
  {id:'ar-finance',name:'Accounts Receivable / Finance',branch_id:null,phone:'(801) 555-0115',email:'ar@herrickindustrial.com',hours:'Mon–Fri 8:00 AM–4:30 PM'},
  ...BRANCHES.map(b=>({id:`will-call-${b.id}`,name:`Warehouse / Will-call · ${b.code}`,branch_id:b.id as string|null,phone:b.phone,email:null as string|null,hours:b.hours})),
];

export const DELIVERY_RATES={id:'default',base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25};

export const PRICE_LEVEL={id:'contractor-2',code:'CT2',name:'Contractor tier 2'};

// Ship-to is 12.0 mi straight-line due south of the SLC branch, so delivery reproduces the
// spec §5.3 example: 12 mi -> 15.0 road mi -> $25 + $37.50 = $62.50.
export const WASATCH={id:'wasatch',account_number:'WAS-1142',name:'Wasatch Mechanical Contractors',terms:'Net 30',credit_limit:50000,open_balance:18420,past_due_balance:0,tax_status:'taxable',tax_state:'UT',price_level_id:PRICE_LEVEL.id,main_phone:'(801) 555-0148',ship_to_name:'Wasatch Mechanical Contractors, main yard',ship_to_address:'1800 W 10950 S',ship_to_city:'South Jordan',ship_to_state:'UT',ship_to_zip:'84095',ship_to_lat:40.5513,ship_to_lng:-111.933};
export const DANA={id:'dana',customer_id:WASATCH.id,name:'Dana Ortiz',title:'Purchasing',phone:'(801) 555-0142',email:'dana.ortiz@wasatchmechanical.example',is_primary:1};
export const WASATCH_REP='brandi';
export const TAX_RATE=0.0725;

// Placeholders exist so the customer picker, Customers list and Rep assignments show
// several customers. They have no orders, quotes, prices or logs (spec §2).
export const PLACEHOLDER_CUSTOMERS=[
  {id:'great-basin',account_number:'GBF-2207',name:'Great Basin Fabrication',rep:'brandi'},
  {id:'uinta-facility',account_number:'UFS-4051',name:'Uinta Facility Services',rep:'nora'},
];

// Mara's and Eli's books (v3 decision 39; task F1): accounts with a ship-to inside the delivery radius
// and one buyer each (a name and title only), so ./demo can seed their quotes. Each delivers from its
// nearest branch. Canyon Ridge was a placeholder before v3.
export const DEMO_CUSTOMERS=[
  {id:'canyon-ridge',account_number:'CRB-3318',name:'Canyon Ridge Builders',rep:'mara',branch:'slc',terms:'Net 30',credit_limit:40000,open_balance:9650,
    ship_to_name:'Canyon Ridge Builders, Draper yard',ship_to_address:'250 W Galena Park Blvd',ship_to_city:'Draper',ship_to_zip:'84020',ship_to_lat:40.523,ship_to_lng:-111.893,
    contact:{id:'luis',name:'Luis Herrera',title:'Project Manager'}},
  {id:'utah-valley-electric',account_number:'UVE-5126',name:'Utah Valley Electric',rep:'eli',branch:'provo',terms:'Net 30',credit_limit:30000,open_balance:4210,
    ship_to_name:'Utah Valley Electric, Orem shop',ship_to_address:'870 S Geneva Rd',ship_to_city:'Orem',ship_to_zip:'84058',ship_to_lat:40.283,ship_to_lng:-111.722,
    contact:{id:'kim',name:'Kim Nakamura',title:'Purchasing'}},
  {id:'weber-basin',account_number:'WBF-6074',name:'Weber Basin Fabricators',rep:'eli',branch:'ogden',terms:'Net 45',credit_limit:25000,open_balance:2875,
    ship_to_name:'Weber Basin Fabricators, plant',ship_to_address:'1150 S 3300 W',ship_to_city:'Ogden',ship_to_zip:'84401',ship_to_lat:41.21,ship_to_lng:-112.04,
    contact:{id:'tom',name:'Tom Becker',title:'Shop Foreman'}},
] as const;
export type DemoCustomer=typeof DEMO_CUSTOMERS[number];

/** Contract windows are day offsets from the anchor (anchor 2026-09-23 gives Jan 1 to Dec 31, 2026). */
export const CONTRACTS=[
  {id:'wasatch-2026-abrasives',contract_number:'WAS-C-2026-01',name:'Abrasives supply agreement',starts:-265,ends:99,lines:[['CW-45-045-T1',36.00],['CW-45-045-T27',37.40],['CW-6-045-T1',48.50],['FD-45-60Z',44.25],['FD-45-80Z',44.25]] as [string,number][]},
  {id:'wasatch-2025-ppe',contract_number:'WAS-C-2025-02',name:'PPE pricing agreement (expired)',starts:-630,ends:-266,lines:[['GLV-N8-L-1000',74.00],['SG-CLR-AF',27.50]] as [string,number][]},
];
