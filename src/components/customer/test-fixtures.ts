import {vi} from 'vitest';
import type {CustomerNotifications,CustomerOrderRow,CustomerQuoteSummary,CustomerRepContact} from '@/domain';
import type {API,Principal} from '@/lib/contracts';

// Test data for the customer site (plan U10): Wasatch's rep, orders, notifications and quotes as the API returns them.

export const dana:Principal={user_id:'dana',role:'customer_user',customer_id:'wasatch',name:'Wasatch Mechanical Contractors',user_name:'Dana Ortiz',rep_id:null,rep_role:null,contact_id:'dana'};

export const repContact:CustomerRepContact={
  rep:{name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com',picture_url:null},
};

const order=(n:number,o:Partial<CustomerOrderRow>={}):CustomerOrderRow=>({id:`so-${n}`,order_number:`SO-${n}`,order_date:'2026-08-01',status:'closed',fulfillment:'will_call',branch_code:'SLC',total:100+n%100,quote_number:null,...o});

/** Newest first: 8 orders, so the sheet shows 5 and "Show 3 more". */
export const orders:CustomerOrderRow[]=[
  order(51223,{order_date:'2026-09-09',status:'shipped',fulfillment:'delivery',total:698.22,quote_number:'Q-24816'}),
  order(51222,{order_date:'2026-08-26',fulfillment:'delivery',branch_code:'Provo',total:304.23,quote_number:'Q-24814'}),
  order(51221,{order_date:'2026-08-12',total:481.87,quote_number:'Q-24812'}),
  order(51220,{order_date:'2026-07-29',fulfillment:'delivery',total:303.38,quote_number:'Q-24811'}),
  order(51219,{order_date:'2026-07-15',total:175.03}),
  order(51218,{order_date:'2026-07-01',total:203.45,status:'open'}),
  order(51217,{order_date:'2026-06-18',total:483.99}),
  order(51216,{order_date:'2025-06-04',total:1219.7}),
];

export const NOW='2026-09-23T18:00:00.000Z';

/** Two unread (a quote ready 30 seconds ago, a revision 2 hours ago) and one read (an order shipped yesterday). */
export const notifications:CustomerNotifications={unread:2,items:[
  {id:'quote:q-24817:rev:1',kind:'quote_ready',title:'Quote Q-24817 is ready to review',body:'$1,122.40. Brandi sent it today.',at:'2026-09-23T17:59:30.000Z',day_only:false,read:false,quote:{id:'q-24817',quote_number:'Q-24817'}},
  {id:'quote:q-24790:rev:2',kind:'quote_updated',title:'Brandi updated Q-24790',body:'The changes you asked for are in. Revision 2.',at:'2026-09-23T16:00:00.000Z',day_only:false,read:false,quote:{id:'q-24790',quote_number:'Q-24790'}},
  {id:'order:so-51223:shipped',kind:'order_shipped',title:'Order SO-51223 has shipped',body:'Delivery, SLC. From quote Q-24816.',at:'2026-09-22T00:00:00.000Z',day_only:true,read:true,quote:null},
]};

const summary=(q:Partial<CustomerQuoteSummary>&Pick<CustomerQuoteSummary,'id'|'quote_number'|'status'|'requested_at'>):CustomerQuoteSummary=>({revision:1,sent_at:null,valid_until:null,total:null,unread:false,...q});

/** Newest first, one per status. */
export const quotes:CustomerQuoteSummary[]=[
  summary({id:'q-24817',quote_number:'Q-24817',status:'ready_for_review',revision:0,requested_at:'2026-09-23T16:14:00.000Z'}),
  summary({id:'q-24820',quote_number:'Q-24820',status:'sent',requested_at:'2026-09-20T15:00:00.000Z',sent_at:'2026-09-21T16:00:00.000Z',valid_until:'2026-10-05',total:1109.5,unread:true}),
  summary({id:'q-24819',quote_number:'Q-24819',status:'changes_requested',requested_at:'2026-09-15T15:00:00.000Z',sent_at:'2026-09-15T17:00:00.000Z',valid_until:'2026-09-29',total:322.8}),
  summary({id:'q-24816',quote_number:'Q-24816',status:'accepted',requested_at:'2026-09-07T15:20:00.000Z',sent_at:'2026-09-07T16:20:00.000Z',valid_until:'2026-09-21',total:655.25}),
  summary({id:'q-24793',quote_number:'Q-24793',status:'expired',requested_at:'2025-09-28T15:20:00.000Z',sent_at:'2025-09-28T16:55:00.000Z',valid_until:'2025-10-12',total:411.7}),
];

/** A fake API: GET paths map to results (a function may throw); anything else is unexpected. */
export function fakeApi(routes:Record<string,unknown|(()=>unknown)>,send:API['send']=vi.fn()):API{
  const get=vi.fn(async(path:string)=>{
    if(!(path in routes))throw new Error(`unexpected get ${path}`);
    const result=routes[path];
    return typeof result==='function'?(result as ()=>unknown)():result;
  });
  return {get:get as unknown as API['get'],send};
}

/** What the customer site reads around the chat: the bell polls notifications; the sheets read orders and the rep when opened. */
export const siteRoutes={'customer/notifications':{unread:0,items:[]} as CustomerNotifications,'customer/orders':orders,'customer/contacts':repContact};
