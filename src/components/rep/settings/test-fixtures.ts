import type {RepSettings} from '@/server/rep/settings';

// Tests only: Settings as GET /api/rep/settings returns it for Brandi on the seed (task 6.1).

const rep=(id:string,name:string,initials:string,title='Inside Sales')=>({id,name,initials,title});
export const REPS=[rep('brandi','Brandi Gallegos','BG'),rep('eli','Eli Porter','EP','Outside Sales'),rep('mara','Mara Jensen','MJ'),rep('nora','Nora Chen','NC','Account Manager')];

const CATEGORIES:[string,string][]=[['fasteners','Fasteners'],['abrasives','Abrasives & Cutting'],['safety','Safety & PPE'],['material','Material Handling & Tie-downs'],['tools','Tools'],['janitorial','Janitorial/MRO']];
const floors=(values:number[])=>CATEGORIES.map(([category_id,category_name],i)=>({category_id,category_name,margin_floor:values[i],label:`${(values[i]*100).toFixed(1)}%`,updated_at:'2026-09-23T12:00:00.000Z'}));

const rule=(category:'items_stock'|'pricing'|'orders_quotes'|'account',enabled:boolean|null,one=true)=>({category,enabled,rep_id:one?'brandi':null,mixed_rep:!one,
  rep_name:one?'Brandi Gallegos':'Multiple reps',phone:one?'(801) 111-2222':null,email:one?'brandi.gallegos@herrickindustrial.com':null});

/** Brandi's Settings, with Customer access for `customerId` (null: All customers). */
export function settingsFixture(customerId:string|null=null):RepSettings{
  const one=customerId!==null;
  return {
    rep_id:'brandi',
    reps:REPS,
    assignments:[
      {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen',placeholder:true,quotes:[]},
      {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos',placeholder:true,quotes:[]},
      {id:'uinta-facility',name:'Uinta Facility Services',account_number:'UFS-4051',rep_id:'nora',rep_name:'Nora Chen',placeholder:true,quotes:[]},
      {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos',placeholder:false,quotes:[{rep_id:'brandi',rep_name:'Brandi Gallegos',count:25}]},
    ],
    access:{customer_id:customerId,rules:[rule('items_stock',true,one),rule('pricing',true,one),rule('orders_quotes',true,one),rule('account',true,one)]},
    floors:{
      mine:{rep:REPS[0],floors:floors([0.2,0.25,0.3,0.2,0.18,0.2])},
      others:REPS.slice(1).map(r=>({rep:r,floors:floors([0.2,0.2,0.2,0.2,0.2,0.2])})),
    },
    pricing:{scarcity_uplift_enabled:false},
    delivery:{base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25},
    sources:{
      database:{seed_date:'2026-09-23',schema_migration:'001_baseline',records:{customers:4,items:60,orders:180,quotes:25},synced_at:'2026-09-23T12:00:00.000Z'},
      erp:{last_updated:'2026-09-27T02:43:01.000Z',events:[{id:2,timestamp:'2026-09-27T02:43:01.000Z',message:'ERP connection refreshed'},{id:1,timestamp:'2026-09-27T02:42:01.000Z',message:'ERP connection refreshed'}]},
    },
  };
}
