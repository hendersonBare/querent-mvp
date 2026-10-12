'use client';
import {useEffect,useState} from 'react';
import type {CustomerOrderRow,OrderStatus} from '@/domain';
import type {API} from '@/lib/contracts';
import {cx} from '@/components/ui/cx';
import {SiteSheet} from './SiteSheet';
import {orderDate} from './time-ago';
import s from './site.module.css';

/** Rows before "Show N more" (C_CVL2 shows five). */
export const ORDERS_PAGE=5;
const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const STATUS:Record<OrderStatus,string>={open:'Open',shipped:'Shipped',closed:'Closed'};

/**
 * The Orders sheet (plan U10; C_CVL2): "Previous orders" with their count, newest first: order number,
 * date, fulfillment and branch, the quote it came from, total and status ("Shipped" in green). Five
 * rows, then "Show N more" shows the rest. Read from GET /api/query/customer/orders when it opens.
 */
export function OrdersSheet({api,onClose}:{api:API;onClose:()=>void}){
  const [rows,setRows]=useState<CustomerOrderRow[]|null>(null);
  const [error,setError]=useState('');
  const [all,setAll]=useState(false);
  useEffect(()=>{
    let live=true;
    api.get<CustomerOrderRow[]>('customer/orders').then(r=>{if(live)setRows(r);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Your orders could not be loaded.');});
    return ()=>{live=false;};
  },[api]);
  const shown=rows?(all?rows:rows.slice(0,ORDERS_PAGE)):[];
  const remaining=rows?rows.length-shown.length:0;
  return <SiteSheet title="Previous orders" icon="orders" count={rows?.length} onClose={onClose}>
    {error?<div className={s.sheetError} role="alert">{error}</div>
      :rows&&!rows.length?<div className={s.sheetEmpty}>No orders yet.</div>
      :shown.map(o=><div key={o.id} className={s.order} data-order={o.order_number}>
        <div>
          <div className={s.orderLine}><span className={s.orderNumber}>{o.order_number}</span><span className={s.orderDate}>{orderDate(o.order_date)}</span></div>
          <div className={s.orderMeta}>{`${o.fulfillment==='delivery'?'Delivery':'Will call'}, ${o.branch_code}${o.quote_number?` · From quote ${o.quote_number}`:''}`}</div>
        </div>
        <div className={s.orderRight}>
          <div className={s.orderTotal}>{usd.format(o.total)}</div>
          <div className={cx(s.orderStatus,o.status==='shipped'&&s.shipped)}>{STATUS[o.status]}</div>
        </div>
      </div>)}
    {remaining>0&&<div className={s.moreRow}><button type="button" className={s.more} onClick={()=>setAll(true)}>{`Show ${remaining} more`}</button></div>}
  </SiteSheet>;
}
