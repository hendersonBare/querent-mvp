import {vi} from 'vitest';
import type {CustomerContacts,CustomerQuoteSummary} from '@/domain';
import type {API,Principal} from '@/lib/contracts';

// Test data for the customer layout: Wasatch's contacts and quotes as the API returns them.

export const dana:Principal={user_id:'dana',role:'customer_user',customer_id:'wasatch',name:'Wasatch Mechanical Contractors',user_name:'Dana Ortiz',rep_id:null,rep_role:null,contact_id:'dana'};

export const contacts:CustomerContacts={
  supplier:'Herrick Industrial Supply',
  rep:{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},
  departments:[
    {id:'customer-service',name:'Customer Service',branch_id:null,phone:'(801) 555-0110',email:'customerservice@herrickindustrial.com',hours:'Mon–Fri 7:00 AM–5:00 PM',sort_order:1},
    {id:'ar-finance',name:'Accounts Receivable / Finance',branch_id:null,phone:'(801) 555-0115',email:'ar@herrickindustrial.com',hours:'Mon–Fri 8:00 AM–4:30 PM',sort_order:2},
  ],
  willCall:[
    {id:'will-call-slc',branch_id:'slc',code:'SLC',name:'Salt Lake City',phone:'(801) 555-0120',email:null,hours:'Mon–Fri 6:30 AM–5:00 PM'},
    {id:'will-call-ogden',branch_id:'ogden',code:'Ogden',name:'Ogden',phone:'(801) 555-0130',email:null,hours:'Mon–Fri 7:00 AM–4:30 PM'},
    {id:'will-call-provo',branch_id:'provo',code:'Provo',name:'Provo',phone:'(801) 555-0140',email:null,hours:'Mon–Fri 7:00 AM–4:30 PM'},
  ],
};

const summary=(q:Partial<CustomerQuoteSummary>&Pick<CustomerQuoteSummary,'id'|'quote_number'|'status'|'requested_at'>):CustomerQuoteSummary=>({revision:1,sent_at:null,valid_until:null,total:null,unread:false,...q});

/** Newest first, one per status. */
export const quotes:CustomerQuoteSummary[]=[
  summary({id:'q-24817',quote_number:'Q-24817',status:'ready_for_review',revision:0,requested_at:'2026-09-23T16:14:00.000Z'}),
  summary({id:'q-24820',quote_number:'Q-24820',status:'sent',requested_at:'2026-09-20T15:00:00.000Z',sent_at:'2026-09-21T16:00:00.000Z',valid_until:'2026-10-05',total:1109.5,unread:true}),
  summary({id:'q-24819',quote_number:'Q-24819',status:'changes_requested',requested_at:'2026-09-15T15:00:00.000Z',sent_at:'2026-09-15T17:00:00.000Z',valid_until:'2026-09-29',total:322.8}),
  summary({id:'q-24816',quote_number:'Q-24816',status:'accepted',requested_at:'2026-09-07T15:20:00.000Z',sent_at:'2026-09-07T16:20:00.000Z',valid_until:'2026-09-21',total:655.25}),
  summary({id:'q-24793',quote_number:'Q-24793',status:'expired',requested_at:'2025-09-28T15:20:00.000Z',sent_at:'2025-09-28T16:55:00.000Z',valid_until:'2025-10-12',total:411.7}),
];

export const NOW='2026-09-23T18:00:00.000Z';

/** A fake API: GET paths map to results (a function may throw); anything else is unexpected. */
export function fakeApi(routes:Record<string,unknown|(()=>unknown)>,send:API['send']=vi.fn()):API{
  const get=vi.fn(async(path:string)=>{
    if(!(path in routes))throw new Error(`unexpected get ${path}`);
    const result=routes[path];
    return typeof result==='function'?(result as ()=>unknown)():result;
  });
  return {get:get as unknown as API['get'],send};
}

export const sidebarRoutes={'customer/contacts':contacts,'customer/quotes':quotes,'erp/status':{last_updated:null,events:[]}};
