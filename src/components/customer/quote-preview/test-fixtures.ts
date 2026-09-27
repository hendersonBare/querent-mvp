import type {CustomerQuotePreview} from '@/domain';

// The preview modal's data as GET customer/quotes/<id> returns it (task 5.1), one per state.

const rep={name:'Brandi Gallegos',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'};
const base={id:'q-24817',quote_number:'Q-24817',requested_at:'2026-09-23T16:14:00.000Z',rep};
const shown=(revision:number,extra:Partial<NonNullable<CustomerQuotePreview['shown']>>={})=>({revision,sent_at:'2026-09-23T17:00:00.000Z',total:1122.4,valid_until:'2026-10-07',attach_pdf:true,
  pdf_url:`/api/quotes/q-24817/pdf?variant=customer&rev=${revision}`,...extra});

export const previews={
  awaiting:{...base,status:'ready_for_review',latest_revision:0,shown:null},
  sent:{...base,status:'sent',latest_revision:1,shown:shown(1)},
  noAttachment:{...base,status:'sent',latest_revision:1,shown:shown(1,{attach_pdf:false})},
  expired:{...base,status:'expired',latest_revision:1,shown:shown(1)},
  accepted:{...base,status:'accepted',latest_revision:1,shown:shown(1)},
  changesRequested:{...base,status:'changes_requested',latest_revision:1,shown:shown(1)},
  latest:{...base,status:'sent',latest_revision:2,shown:shown(2,{total:1000,valid_until:'2026-10-08',sent_at:'2026-09-24T10:00:00.000Z'})},
  older:{...base,status:'sent',latest_revision:2,shown:shown(1,{attach_pdf:false})},
} satisfies Record<string,CustomerQuotePreview>;

export const NOW='2026-09-24T12:00:00.000Z';
