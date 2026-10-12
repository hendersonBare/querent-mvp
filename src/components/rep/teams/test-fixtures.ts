import type {TeamsBoard} from '@/server/rep/teams';

// A Teams and Reps board like the seed's (plan U7): Brandi is the manager (not listed), Mara, Eli and Nora
// are reps; Inside Sales holds Brandi and Mara, Outside Sales Eli and Nora.

const q=(n:number)=>({id:`q${n}`,quote_number:`Q-${24700+n}`});

export const BOARD:TeamsBoard={
  me:'brandi',
  reps:[
    {id:'eli',name:'Eli Porter',title:'Outside Sales',team_id:2,team:'Outside Sales',active:true,customer_ids:['utah-valley-electric','weber-basin'],open_quotes:[q(1),q(2)]},
    {id:'mara',name:'Mara Jensen',title:'Inside Sales',team_id:1,team:'Inside Sales',active:true,customer_ids:['canyon-ridge'],open_quotes:[q(3),q(4),q(5)]},
    {id:'nora',name:'Nora Chen',title:'Account Manager',team_id:2,team:'Outside Sales',active:true,customer_ids:['uinta-facility'],open_quotes:[]},
  ],
  owners:[
    {id:'brandi',name:'Brandi Gallegos',role:'manager',active:true,customer_count:2},
    {id:'eli',name:'Eli Porter',role:'rep',active:true,customer_count:2},
    {id:'mara',name:'Mara Jensen',role:'rep',active:true,customer_count:1},
    {id:'nora',name:'Nora Chen',role:'rep',active:true,customer_count:1},
  ],
  teams:[
    {id:1,name:'Inside Sales',parent_team_id:null,depth:0,member_ids:['brandi','mara'],rep_ids:['brandi','mara']},
    {id:2,name:'Outside Sales',parent_team_id:null,depth:0,member_ids:['eli','nora'],rep_ids:['eli','nora']},
  ],
  customers:[
    {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen',open_quote_reps:['mara','mara','eli']},
    {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos',open_quote_reps:[]},
    {id:'uinta-facility',name:'Uinta Facility Services',account_number:'UFS-4051',rep_id:'nora',rep_name:'Nora Chen',open_quote_reps:[]},
    {id:'utah-valley-electric',name:'Utah Valley Electric',account_number:'UVE-5126',rep_id:'eli',rep_name:'Eli Porter',open_quote_reps:['eli','eli','eli']},
    {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos',open_quote_reps:['brandi','brandi','brandi','brandi']},
    {id:'weber-basin',name:'Weber Basin Fabricators',account_number:'WBF-6074',rep_id:'eli',rep_name:'Eli Porter',open_quote_reps:['eli']},
  ],
};

/** The board with Outside Sales moved inside Inside Sales. */
export const NESTED:TeamsBoard={...BOARD,teams:[
  {id:1,name:'Inside Sales',parent_team_id:null,depth:0,member_ids:['brandi','mara'],rep_ids:['brandi','eli','mara','nora']},
  {id:2,name:'Outside Sales',parent_team_id:1,depth:1,member_ids:['eli','nora'],rep_ids:['eli','nora']},
]};
