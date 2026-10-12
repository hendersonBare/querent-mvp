import type {FeatureFlags} from '@/server/flags';
import type {FreightSettingsView,ImpactPreviewView} from '@/server/rep/freight-settings';
import type {AccessTable,RepSettings} from '@/server/rep/settings';

// Tests only: Settings as GET /api/rep/settings returns it on the seed (task 6.1; plan U8).

const rep=(id:string,name:string,initials:string,title='Inside Sales')=>({id,name,initials,title});
export const REPS=[rep('brandi','Brandi Gallegos','BG'),rep('eli','Eli Porter','EP','Outside Sales'),rep('mara','Mara Jensen','MJ'),rep('nora','Nora Chen','NC','Account Manager')];

const CATEGORIES:[string,string][]=[['fasteners','Fasteners'],['abrasives','Abrasives & Cutting'],['safety','Safety & PPE'],['material-handling','Material Handling & Tie-downs'],['tools','Tools'],['janitorial','Janitorial/MRO']];
const pct=(n:number)=>`${(n*100).toFixed(1)}%`;
const floors=(values:number[])=>CATEGORIES.map(([category_id,category_name],i)=>({category_id,category_name,margin_floor:values[i],label:pct(values[i]),updated_at:'2026-09-23T12:00:00.000Z'}));
export const ORG_FLOORS=CATEGORIES.map(([category_id,category_name],i)=>({category_id,category_name,floor:i===4?0.18:0.2,label:i===4?'18.0%':'20.0%'}));

export const rule=(category:'items_stock'|'pricing'|'orders_quotes'|'account',enabled:boolean|null)=>({category,enabled,rep_id:null,mixed_rep:true,rep_name:'Multiple reps',phone:null,email:null});
export const ALL_ON=[rule('items_stock',true),rule('pricing',true),rule('orders_quotes',true),rule('account',true)];
export const AGING={rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168};
export const FLAGS_OFF:FeatureFlags={freeDeliveryPricing:false,recoveryPool:false,deliveryCostModel:false};
export const FLAGS_ON:FeatureFlags={freeDeliveryPricing:true,recoveryPool:true,deliveryCostModel:true};

const access=(on:Partial<Record<'items_stock'|'pricing'|'orders_quotes'|'account',boolean>>={})=>({items_stock:true,pricing:true,orders_quotes:true,account:true,...on});
/** Every seeded customer, as GET /api/rep/settings/access lists them. */
export const CUSTOMERS=[
  {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',access:access()},
  {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',access:access({pricing:false})},
  {id:'uinta-facility',name:'Uinta Facility Services',account_number:'UFS-4051',access:access({pricing:false})},
  {id:'utah-valley-electric',name:'Utah Valley Electric',account_number:'UVE-5126',access:access()},
  {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',access:access()},
  {id:'weber-basin',name:'Weber Basin Fabricators',account_number:'WBF-6074',access:access()},
];
export const table=(q:string,ids:string[]):AccessTable=>({q,total:6,customers:CUSTOMERS.filter(c=>ids.includes(c.id))});

/** Brandi's Settings (manager:false gives Mara's: her own floors only). */
export function settingsFixture({manager=true,flags=FLAGS_OFF,accessTable=null}:{manager?:boolean;flags?:FeatureFlags;accessTable?:AccessTable|null}={}):RepSettings{
  if(!manager)return {rep_id:'mara',manager:null,mine:{rep:REPS[2],floors:floors([0.2,0.2,0.2,0.2,0.2,0.2])}};
  return {
    rep_id:'brandi',
    manager:{
      access:ALL_ON,accessTable,orgFloors:ORG_FLOORS,
      repMargins:REPS.map((r,i)=>({rep:r,floors:floors(i===0?[0.2,0.25,0.3,0.2,0.18,0.2]:i===1?[0.22,0.25,0.3,0.2,0.18,0.21]:[0.2,0.2,0.2,0.2,0.2,0.2])})),
      pricing:{scarcity_uplift_enabled:false},
      delivery:{base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25},
      aging:AGING,flags,
    },
    mine:{rep:REPS[0],floors:floors([0.2,0.25,0.3,0.2,0.18,0.2])},
  };
}

export const VIEW:FreightSettingsView={
  enabled:false,enabledAt:null,previewViewedAt:null,previewValid:false,
  cost:{mpg:10,fuelType:'gasoline',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:null},
  rates:{startingRateBp:300,rateCapBp:800,lineCapBp:800,rampSteps:3,rampDays:90},
  pool:{computedBp:null,count:4,minCount:20,usingPool:false,startingBp:300,capBp:800,baseBp:300,step:0,steps:3,rateInForceBp:0,windowDays:90,
    schedule:[{step:1,fromDay:0,rateBp:100,startsAt:null},{step:2,fromDay:30,rateBp:200,startsAt:null},{step:3,fromDay:60,rateBp:300,startsAt:null}],
    modelledCents:16852,recoveredCents:0},
  fuel:[{state:'UT',fuelType:'gasoline',cents:340,source:'seed',asOf:'2026-09-23T00:00:00.000Z',ageDays:17,warnings:['Fuel price is 17 days old.']}],
  warnings:['Fuel price is 17 days old.'],
};
export const PREVIEW:ImpactPreviewView={deliveryQuotes:5,affected:2,step1Bp:100,fullBp:300,steps:3,windowDays:90,viewedAt:'2026-10-10T18:00:00.000Z',
  categories:[
    {categoryId:'fasteners',categoryName:'Fasteners',lines:3,step1ChangeBp:102,fullChangeBp:302,quotes:2,step1ChangeCents:12,fullChangeCents:38},
    {categoryId:'tools',categoryName:'Tools',lines:1,step1ChangeBp:55,fullChangeBp:166,quotes:1,step1ChangeCents:15,fullChangeCents:48},
  ]};
const ENABLED_AT='2026-10-10T18:01:00.000Z';
export const ENABLED:FreightSettingsView={...VIEW,enabled:true,enabledAt:ENABLED_AT,previewViewedAt:PREVIEW.viewedAt,previewValid:true,
  pool:{...VIEW.pool,step:1,rateInForceBp:100,schedule:VIEW.pool.schedule.map(s=>({...s,startsAt:new Date(Date.parse(ENABLED_AT)+s.fromDay*86_400_000).toISOString()}))}};
