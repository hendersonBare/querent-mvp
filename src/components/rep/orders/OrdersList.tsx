import Link from 'next/link';
import type {OrderListRow} from '@/domain';
import {RepPageHeader} from '../RepPage';
import {count,day,fulfillment,money} from '../reference/format';
import {Empty,pageStyles as page,OrderStatusChip,referenceStyles as s,type Viewing} from '../reference/parts';

// Orders (spec §4, task 3.8): orders from Herrick's ERP data, newest first, read-only: the rep's
// own customers' (every customer's for the manager, task U1). The page's own ?customer= narrows it
// to one customer; with All customers each row names its customer.

export function OrdersList({rows,viewing}:{rows:OrderListRow[];viewing:Viewing}){
  const allCustomers=viewing.customerId===null;
  return <>
    <RepPageHeader title="Orders" description={`Viewing ${viewing.label} · ${count(rows.length,'order')}`}/>
    <section className={page.card} aria-label={`Orders: ${viewing.label}`}>
      {rows.length?<div className={s.tableWrap}>
        <table className={s.table}>
          <caption>Orders for {viewing.label}, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Order</th>
              {allCustomers&&<th scope="col" className={s.wide}>Customer</th>}
              <th scope="col">Ordered</th>
              <th scope="col" className={s.wide}>Fulfillment</th>
              <th scope="col">Status</th>
              <th scope="col" className={`${s.num} ${s.wide}`}>Lines</th>
              <th scope="col" className={s.num}>Total</th>
            </tr>
          </thead>
          <tbody>{rows.map(o=><tr key={o.id}>
            <th scope="row">
              <Link className={s.name} href={`/rep/orders/${encodeURIComponent(o.order_number)}`}>{o.order_number}</Link>
              {(o.po_number||o.quote_number)&&<span className={s.sub}>
                {o.po_number&&<span className={s.ref}>PO {o.po_number}</span>}{o.po_number&&o.quote_number&&' · '}{o.quote_number&&<span className={s.ref}>from {o.quote_number}</span>}
              </span>}
            </th>
            {allCustomers&&<td className={s.wide}>{o.customer_name}<span className={`${s.sub} ${s.mono}`}>{o.account_number}</span></td>}
            <td className={s.date}>{day(o.order_date)}</td>
            <td className={`${s.wide} ${s.nowrap}`}>{fulfillment(o.fulfillment,o.branch_code)}</td>
            <td><OrderStatusChip status={o.status}/></td>
            <td className={`${s.num} ${s.wide}`}>{o.line_count}</td>
            <td className={`${s.num} ${s.strong}`}>{money(o.total)}</td>
          </tr>)}</tbody>
        </table>
      </div>:<Empty heading={allCustomers?'No orders yet':`No orders for ${viewing.label} yet`}>
        Orders placed with Herrick show up here, read-only from the ERP.
      </Empty>}
    </section>
  </>;
}
