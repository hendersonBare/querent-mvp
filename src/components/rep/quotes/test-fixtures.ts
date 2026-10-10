import type {CustomerListItem} from '@/domain';
import type {QuoteStatusCounts,RepQuoteList,RepQuoteRow} from '@/server/rep/quotes';

// Quotes list fixtures for component tests (task 3.2), shaped like GET /api/rep/quotes.

export const AS_OF='2026-09-25T18:00:00.000Z';

export const CUSTOMERS:CustomerListItem[]=[
  {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen'},
  {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos'},
  {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos'},
];
export const WASATCH=CUSTOMERS[2];

export function quoteRow(overrides:Partial<RepQuoteRow>={}):RepQuoteRow{
  return {id:'q-24816',quote_number:'Q-24816',revision:1,customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',
    status:'accepted',requested_at:'2026-09-07T15:20:00.000Z',sent_at:'2026-09-07T16:20:00.000Z',valid_until:'2026-09-21',
    total:782.75,total_basis:'sent',freight_pending:false,margin:0.281,margin_label:'28.1%',below_floor_count:0,
    unread:false,is_sample:false,line_count:3,change_request:null,...overrides};
}

export const SAMPLE=quoteRow({id:'q-24817',quote_number:'Q-24817',revision:0,status:'ready_for_review',requested_at:'2026-09-23T16:14:00.000Z',sent_at:null,valid_until:null,
  total:1122.4,total_basis:'draft',margin:361.4/1122.4,margin_label:'32.2%',below_floor_count:1,unread:true,is_sample:true,line_count:4});
export const CHANGES=quoteRow({id:'q-24818',quote_number:'Q-24818',revision:1,status:'changes_requested',requested_at:'2026-09-24T15:00:00.000Z',sent_at:'2026-09-24T17:00:00.000Z',
  valid_until:'2026-10-08',total:315,total_basis:'draft',margin:0.3,margin_label:'30.0%',unread:true,line_count:1,
  change_request:{note:'Make it 12 boxes and deliver Friday.',by:'Dana Ortiz',at:'2026-09-25T15:00:00.000Z'}});
export const OLD=quoteRow({id:'q-24793',quote_number:'Q-24793',requested_at:'2025-09-28T15:20:00.000Z',sent_at:'2025-09-28T16:55:00.000Z',total:525.2});

const counts=(rows:RepQuoteRow[]):QuoteStatusCounts=>{
  const c:QuoteStatusCounts={all:0,ready_for_review:0,sent:0,changes_requested:0,accepted:0,expired:0,declined:0};
  for(const r of rows){c[r.status]++;c.all++;}
  return c;
};

/** A list as the API returns it: counts and unread cover `scope`, rows are `scope` filtered by `status`. */
export function quoteList({scope=[CHANGES,SAMPLE,quoteRow(),OLD],status=null,customer=null,other_rep=false}:{scope?:RepQuoteRow[];status?:RepQuoteList['status'];customer?:CustomerListItem|null;other_rep?:boolean}={}):RepQuoteList{
  return {as_of:AS_OF,customer,other_rep,status,counts:counts(scope),unread:scope.filter(r=>r.unread).length,rows:status?scope.filter(r=>r.status===status):scope};
}
