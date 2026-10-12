import type {CustomerListItem} from '@/domain';
import type {AnalyticsPage,RepAnalytics,WeekPoint} from '@/server/analytics';
import type {GroupRow,MetricsRep,OtherNote,TeamRow} from '@/server/team/metrics';

// GET /api/rep/analytics responses for component tests: Brandi's seed numbers as of Sep 23, 2026
// (src/server/analytics/service.test.ts checks them against the database), and an empty view.

export const CUSTOMERS:CustomerListItem[]=[
  {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen'},
  {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos'},
  {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos'},
];

const FIRST_WEEK=Date.parse('2026-03-30T00:00:00.000Z');
/** [week start, quotes, won, lost, open] for the seed's weeks with quotes. */
const SEED_WEEKS:[string,number,number,number,number][]=[
  ['2026-03-30',1,1,0,0],['2026-04-13',2,1,1,0],['2026-04-27',1,1,0,0],['2026-05-25',1,1,0,0],['2026-06-15',1,1,0,0],['2026-06-29',1,1,0,0],['2026-07-06',1,0,1,0],
  ['2026-07-27',1,1,0,0],['2026-08-10',1,1,0,0],['2026-08-17',1,0,1,0],['2026-08-24',1,1,0,0],['2026-08-31',1,0,1,0],['2026-09-07',1,1,0,0],['2026-09-21',1,0,0,1],
];
function weeks(filled:boolean):WeekPoint[]{
  return Array.from({length:26},(_,i)=>{
    const week_start=new Date(FIRST_WEEK+i*7*86_400_000).toISOString().slice(0,10);
    const seed=filled?SEED_WEEKS.find(w=>w[0]===week_start):undefined;
    return {week_start,quotes:seed?.[1]??0,won:seed?.[2]??0,lost:seed?.[3]??0,open:seed?.[4]??0};
  });
}

const categories=['items_stock','pricing','orders_quotes','account'] as const;

export function seedAnalytics(customer:CustomerListItem|null=null):RepAnalytics{
  return {
    as_of:'2026-09-23T18:00:00.000Z',
    scope:{customer,customer_ids:customer?[customer.id]:['great-basin','wasatch'],rep_id:'brandi'},
    turnaround:{median_minutes:92.5,quotes:24,fastest_minutes:35,slowest_minutes:260},
    win_rate:{rate:17/24,won:17,lost:7,open:1},
    quoted:{quoted:9045.35,accepted:7008.05,quoted_count:24,accepted_count:17,share:7008.05/9045.35},
    hours_saved:{hours:8,minutes:480,quotes_sent:24,minutes_per_quote:20},
    extra_gp:{amount:10.2,lines:2,quotes:2,accepted_quotes:17},
    weekly:weeks(true),
    margin:{
      overall:{margin:0.338,floor:0.2397,revenue:8309.6,lines:56,below_floor:3},
      categories:[
        {category_id:'fasteners',name:'Fasteners',margin:0.3222,floor:0.2,revenue:2164.4,lines:15,below_floor:0},
        {category_id:'abrasives',name:'Abrasives & Cutting',margin:0.3419,floor:0.25,revenue:2292.35,lines:11,below_floor:0},
        {category_id:'safety',name:'Safety & PPE',margin:0.342,floor:0.3,revenue:2230.15,lines:13,below_floor:3},
        {category_id:'tools',name:'Tools',margin:0.3559,floor:0.18,revenue:380.55,lines:6,below_floor:0},
      ],
    },
    top_items:[
      {item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',quote_count:6,total_qty:60},
      {item_id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',quote_count:6,total_qty:44},
      {item_id:'HN-12-13-G8',sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',quote_count:5,total_qty:25},
    ],
    questions:{total:40,answered:40,with_data:37,no_match:3,needed_rep:0,rate:1},
    queries:{total_queries:40,minutes_saved:303,hours_saved:'5.0',categories:categories.map((category,i)=>({category,count:[14,13,10,10][i],rep_name:'Brandi Gallegos'}))},
    access:categories.map(category=>({category,enabled:true,rep_id:'brandi',mixed_rep:false,rep_name:'Brandi Gallegos',phone:null,email:null})),
  };
}

/** A customer with no data: a placeholder customer of the rep's. */
export function emptyAnalytics(customer:CustomerListItem):RepAnalytics{
  return {
    as_of:'2026-09-23T18:00:00.000Z',
    scope:{customer,customer_ids:[customer.id],rep_id:'brandi'},
    turnaround:{median_minutes:null,quotes:0,fastest_minutes:null,slowest_minutes:null},
    win_rate:{rate:null,won:0,lost:0,open:0},
    quoted:{quoted:0,accepted:0,quoted_count:0,accepted_count:0,share:null},
    hours_saved:{hours:0,minutes:0,quotes_sent:0,minutes_per_quote:20},
    extra_gp:{amount:0,lines:0,quotes:0,accepted_quotes:0},
    weekly:weeks(false),
    margin:{overall:{margin:null,floor:null,revenue:0,lines:0,below_floor:0},categories:[]},
    top_items:[],
    questions:{total:0,answered:0,with_data:0,no_match:0,needed_rep:0,rate:null},
    queries:{total_queries:0,minutes_saved:0,hours_saved:'0.0',categories:categories.map(category=>({category,count:0,rep_name:customer.rep_name??'Self-serve'}))},
    access:categories.map(category=>({category,enabled:true,rep_id:customer.rep_id,mixed_rep:false,rep_name:customer.rep_name??'Self-serve',phone:null,email:null})),
  };
}

// ---- The whole page (plan U6): the filter, the grouped Team metrics and the options ----

export const REPS:MetricsRep[]=[
  {id:'brandi',name:'Brandi Gallegos',team:'Inside Sales',active:true},
  {id:'eli',name:'Eli Porter',team:'Outside Sales',active:true},
  {id:'mara',name:'Mara Jensen',team:'Inside Sales',active:true},
  {id:'nora',name:'Nora Chen',team:'Outside Sales',active:true},
];
export const WINDOW={from:'2026-09-12T06:00:00.000Z',to:'2026-10-12T06:00:00.000Z'};

const zeroDeclines={price_too_high:0,found_other_source:0,need_sooner:0,wrong_items:0,other:0,none:0};
const zeroUntouched={draft_never_opened:0,draft_opened_not_sent:0,changes_not_revised:0,sent_never_opened:0,sent_opened_no_reply:0,expired_no_response:0};

/** A leaderboard row: `created` quotes split as given, the rest zero or null. */
export function teamRow(name:string,rep_id:string|null,more:Partial<TeamRow>={}):TeamRow{
  return {rep_id,name,team:null,active:true,created:0,
    statuses:{ready_for_review:0,changes_requested:0,sent:0,accepted:0,declined:0,expired:0},
    open:{total:0,ok:0,amber:0,red:0},rates:{quote_to_order:null,unaccepted:null,decided_win:null},
    hours:{to_send:null,customer_response:null,ready_for_review:null,sent:null,changes_requested:null},
    value:{quoted_cents:0,accepted_cents:0},avg_margin:null,freight:{recovered_cents:0,modelled_cents:0},
    declines:{...zeroDeclines},upsell:{suggestions_offered:0,suggestions_added:0,suggestion_rate:null,rep_upsell_lines:0},untouched:{...zeroUntouched},...more};
}
const groupRow=(row:TeamRow,key:string,rep_ids:string[]):GroupRow=>({...row,key,rep_ids,customer_id:null});

const MARA=teamRow('Mara Jensen','mara',{team:'Inside Sales',created:13,statuses:{ready_for_review:2,changes_requested:1,sent:2,accepted:4,declined:3,expired:1},
  open:{total:5,ok:0,amber:2,red:3},rates:{quote_to_order:4/13,unaccepted:4/13,decided_win:0.5},hours:{to_send:119/60,customer_response:76.8,ready_for_review:354/60,sent:100.8,changes_requested:20},
  declines:{...zeroDeclines,price_too_high:1,need_sooner:1,other:1},untouched:{...zeroUntouched,draft_never_opened:2,changes_not_revised:1,sent_never_opened:1,sent_opened_no_reply:1,expired_no_response:1}});
const ELI=teamRow('Eli Porter','eli',{team:'Outside Sales',created:20,statuses:{ready_for_review:3,changes_requested:1,sent:3,accepted:7,declined:3,expired:3},
  open:{total:7,ok:1,amber:5,red:1},rates:{quote_to_order:0.35,unaccepted:0.3,decided_win:7/13},hours:{to_send:137/60,customer_response:81.6,ready_for_review:277/60,sent:105.6,changes_requested:null},
  declines:{...zeroDeclines,found_other_source:1,wrong_items:1,none:1},untouched:{...zeroUntouched,draft_never_opened:2,draft_opened_not_sent:1,changes_not_revised:1,sent_never_opened:1,sent_opened_no_reply:1,expired_no_response:3}});
const NORA=teamRow('Nora Chen','nora',{team:'Outside Sales'});
const TOTAL=teamRow('Total',null,{created:33,statuses:{ready_for_review:5,changes_requested:2,sent:5,accepted:11,declined:6,expired:4},open:{total:12,ok:1,amber:7,red:4},
  rates:{quote_to_order:1/3,unaccepted:10/33,decided_win:11/21},hours:{to_send:2,customer_response:79.2,ready_for_review:5,sent:103.2,changes_requested:20},
  declines:{price_too_high:1,found_other_source:1,need_sooner:1,wrong_items:1,other:1,none:1},untouched:{draft_never_opened:4,draft_opened_not_sent:1,changes_not_revised:2,sent_never_opened:2,sent_opened_no_reply:2,expired_no_response:4}});
export const OTHER_NOTE:OtherNote={quote_id:'q-24767',quote_number:'Q-24767',rep_id:'mara',rep_name:'Mara Jensen',customer_id:'canyon-ridge',customer_name:'Canyon Ridge Builders',
  note:'The general contractor is supplying the anchors on this job.',declined_at:'2026-09-28T17:00:00.000Z'};

/** The manager's page: the whole organization, one leaderboard row per active rep. */
export function managerPage(more:Partial<AnalyticsPage>={}):AnalyticsPage{
  return {...seedAnalytics(),scope:{customer:null,customer_ids:CUSTOMERS.map(c=>c.id),rep_id:null},
    filter:{rep_ids:[],teams:[],customer_id:null,breakdown:'org',window:WINDOW},
    groups:{dimension:'rep',rows:[groupRow(teamRow('Brandi Gallegos','brandi',{team:'Inside Sales'}),'brandi',['brandi']),groupRow(ELI,'eli',['eli']),groupRow(MARA,'mara',['mara']),groupRow(NORA,'nora',['nora'])],
      totals:TOTAL,other_notes:[OTHER_NOTE]},
    options:{reps:REPS,teams:['Inside Sales','Outside Sales'],customers:CUSTOMERS},...more};
}

/** Mara's page: her own quotes, one row. */
export function repPage(more:Partial<AnalyticsPage>={}):AnalyticsPage{
  return {...seedAnalytics(),scope:{customer:null,customer_ids:['canyon-ridge'],rep_id:'mara'},
    filter:{rep_ids:['mara'],teams:[],customer_id:null,breakdown:'rep',window:WINDOW},
    groups:{dimension:'rep',rows:[groupRow(MARA,'mara',['mara'])],totals:{...MARA,rep_id:null,name:'Total'},other_notes:[OTHER_NOTE]},
    options:{reps:[],teams:[],customers:[CUSTOMERS[0]]},...more};
}
