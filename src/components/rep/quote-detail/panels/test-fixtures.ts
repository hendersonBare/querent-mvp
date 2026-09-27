import type {QuotePanels} from '@/server/rep/quote-panels';

// Side-panel fixtures for component tests (task 3.4): the sample Q-24817's panels as
// GET /api/rep/quotes/Q-24817 returns them on the mockup's day (seed 2026-09-23). Wasatch:
// Net 30, $18,420.00 open on a $50,000.00 limit, taxable in Utah, last order Sep 9, and 17 of
// 24 decided quotes won (71%).

export const SAMPLE_PANELS:QuotePanels={
  customer:{
    contact:{name:'Dana Ortiz',title:'Purchasing',phone:'(801) 555-0142',email:'dana.ortiz@wasatchmechanical.example'},
    account_number:'WAS-1142',terms:'Net 30',open_balance:18420,past_due_balance:0,credit_limit:50000,tax_status:'taxable',tax_state:'UT',
    last_order:{order_number:'SO-51223',order_date:'2026-09-09',total:698.22},
    win_rate:{rate:17/24,won:17,lost:7,open:1},
  },
  branches:[{id:'slc',code:'SLC',name:'Salt Lake City'},{id:'ogden',code:'Ogden',name:'Ogden'},{id:'provo',code:'Provo',name:'Provo'}],
  notes:[],
  activity:[
    {id:1,quote_id:'q-24817',at:'2026-09-23T16:14:00.000Z',actor:'customer',actor_id:'dana',kind:'requested',message:'Dana asked for bolts, cut-off wheels, gloves and straps in Querent chat'},
    {id:2,quote_id:'q-24817',at:'2026-09-23T16:14:00.000Z',actor:'querent',actor_id:null,kind:'matched',message:'Querent matched 4 items after 1 clarifying question'},
    {id:3,quote_id:'q-24817',at:'2026-09-23T16:15:00.000Z',actor:'querent',actor_id:null,kind:'drafted',message:'Draft quote built and sent to Brandi for review'},
  ],
};
