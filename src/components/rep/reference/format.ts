import type {Fulfillment,OrderStatus} from '@/domain';

// Words and formats for the rep's Customers, Orders and Stock pages (task 3.8; plan U5 words them as the
// frames do: a hyphen for nothing, commas between facts, no em-dashes). Pure: the tests call these directly.

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
/** "$1,122.40", or "-" with no amount (C_CUBase). */
export const money=(n:number|null|undefined)=>n===null||n===undefined?'-':usd.format(n);

const dayFormat=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
/** "Sep 9, 2026" from a day (2026-09-09) or an instant. Days are UTC, like every date in the app. Always with the year: order history spans a year. */
export const day=(iso:string)=>dayFormat.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso)?`${iso}T00:00:00Z`:iso));

/** "37%" from 0.3684. */
export const percent=(fraction:number)=>`${Math.round(fraction*100)}%`;

/** "1 order", "23 orders". */
export const count=(n:number,word:string,plural=`${word}s`)=>`${n} ${n===1?word:plural}`;

/** Order statuses, from the ERP read-only: open, shipped (or picked up) and closed. */
export const ORDER_STATUS:Readonly<Record<OrderStatus,string>>={open:'Open',shipped:'Shipped',closed:'Closed'};

/** "Will call, SLC" or "Delivery, SLC" (the branch it ships from; C_ORBase). */
export const fulfillment=(f:Fulfillment,branchCode:string)=>`${f==='will_call'?'Will call':'Delivery'}, ${branchCode}`;

/** "rev 2", or "Not sent" before the first send. */
export const revision=(n:number)=>n>0?`rev ${n}`:'Not sent';

/** "PO 7777, from Q-24816", "PO 7777", "from Q-24816" or "" (C_ORBase). */
export const orderRefs=(po:string|null,quoteNumber:string|null)=>[po&&`PO ${po}`,quoteNumber&&`from ${quoteNumber}`].filter(Boolean).join(', ');

/** "Taxable (UT)", "Exempt", or null when not on file. */
export function taxStatus(status:'taxable'|'exempt'|null,state:string|null){
  if(!status)return null;
  const word=status==='taxable'?'Taxable':'Exempt';
  return state?`${word} (${state})`:word;
}
