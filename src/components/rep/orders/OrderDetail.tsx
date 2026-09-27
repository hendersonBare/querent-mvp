import Link from 'next/link';
import type {CustomerOrder} from '@/domain';
import {count,day,money} from '../reference/format';
import {Crumbs,DetailHeader,hrefFor,OrderStatusChip,Panel,referenceStyles as s,type Viewing} from '../reference/parts';

// One order (spec §4, task 3.8): its lines at the prices the customer paid, the totals, and the
// order facts (customer, PO, fulfillment, the quote it came from), read-only. No cost or margin.

const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

export function OrderDetail({order,viewing}:{order:CustomerOrder;viewing:Viewing}){
  const willCall=order.fulfillment==='will_call';
  return <>
    <Crumbs section="Orders" href={hrefFor(viewing,'/rep/orders')} current={order.order_number}/>
    <DetailHeader title={order.order_number} chip={<OrderStatusChip status={order.status}/>}
      meta={<>{order.customer_name}{order.po_number&&<> · PO {order.po_number}</>} · Ordered {day(order.order_date)}</>}/>
    <div className={s.grid}>
      <div className={s.main}>
        <Panel id="order-lines" title="Items" meta={count(order.lines.length,'line')} flush>
          <div className={s.tableWrap}><table className={s.table}>
            <caption>{order.order_number} lines with the prices paid</caption>
            <thead><tr>
              <th scope="col">Item</th><th scope="col" className={s.num}>Qty</th><th scope="col" className={s.num}>Price paid</th><th scope="col" className={s.num}>Total</th>
            </tr></thead>
            <tbody>{order.lines.map(l=><tr key={l.line_no}>
              <th scope="row">
                <Link className={s.desc} href={hrefFor(viewing,`/rep/items/${encodeURIComponent(l.sku)}`)}>{l.description}</Link>
                <span className={s.sub}><span className={s.sku}>{l.sku}</span> · {l.pack}</span>
              </th>
              <td className={s.num}>{l.qty}</td>
              <td className={s.num}>{money(l.unit_price)}</td>
              <td className={`${s.num} ${s.strong}`}>{money(round2(l.qty*l.unit_price))}</td>
            </tr>)}</tbody>
          </table></div>
          <dl className={s.totals}>
            <dt>Items</dt><dd>{money(order.subtotal)}</dd>
            <dt>Freight{willCall&&' (will call)'}</dt><dd>{money(order.freight)}</dd>
            <dt>Sales tax</dt><dd>{money(order.tax)}</dd>
            <dt className={s.grand}>Order total</dt><dd className={s.grand}>{money(order.total)}</dd>
          </dl>
        </Panel>
      </div>
      <aside className={s.rail} aria-label="Order details">
        <Panel id="order-facts" title="Order">
          <dl className={s.kv}>
            <dt>Customer</dt><dd><Link href={hrefFor(viewing,`/rep/customers/${encodeURIComponent(order.customer_id)}`)}>{order.customer_name}</Link></dd>
            <dt>Account</dt><dd className={s.mono}>{order.account_number}</dd>
            <dt>Customer PO</dt><dd>{order.po_number??'—'}</dd>
            <dt>Ordered</dt><dd>{day(order.order_date)}</dd>
            <dt>Fulfillment</dt><dd>{willCall?'Will call':'Delivery'} · {order.branch_code}</dd>
            {order.shipped_on&&<><dt>{willCall?'Picked up':'Shipped'}</dt><dd>{day(order.shipped_on)}</dd></>}
            {order.tracking_number&&<><dt>Tracking</dt><dd className={s.mono}>{order.tracking_number}</dd></>}
            <dt>From quote</dt><dd>{order.quote_number?<Link href={hrefFor(viewing,`/rep/quotes/${encodeURIComponent(order.quote_number)}`)} prefetch={false}>{order.quote_number}</Link>:'Direct order'}</dd>
          </dl>
        </Panel>
      </aside>
    </div>
  </>;
}
