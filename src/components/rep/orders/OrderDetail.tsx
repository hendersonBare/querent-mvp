import Link from 'next/link';
import type {CustomerOrder} from '@/domain';
import {count,day,fulfillment,money} from '../reference/format';
import {Card,Cell,DetailHeader,DetailRow,DetailTable,Fact,OrderStatusChip,recordStyles as s} from '../reference/parts';

// One order (plan U5; C_OR2): its lines at the prices the customer paid, the total box, and the order
// details (customer, PO, fulfillment, the quote it came from, the customer's rep), read-only from the
// ERP. No cost or margin. The lines table has no filter and no columns picker.
//
// No frame (docs/plans/status.md): the Closed and Open chips (C_OR2 draws Shipped); "Picked up" for a
// will-call order and "Direct order" with no quote (the page's old words).

const TRACKS='1fr 80px 120px 120px';
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

export function OrderDetail({order}:{order:CustomerOrder}){
  const willCall=order.fulfillment==='will_call';
  const facts=[order.customer_name,order.po_number&&`PO ${order.po_number}`,`ordered ${day(order.order_date)}`].filter(Boolean).join(', ');
  return <>
    <DetailHeader title={order.order_number} mono chip={<OrderStatusChip status={order.status}/>} subtitle={facts}/>
    <div className={`ui-root ${s.columns}`}>
      <div className={`${s.main} ${s.mainWide}`}>
        <Card id="order-lines" title="Items" meta={count(order.lines.length,'line')}>
          <DetailTable label={`${order.order_number} lines with the prices paid`} tracks={TRACKS}
            columns={[{label:'Item'},{label:'Qty',align:'right'},{label:'Price paid',align:'right'},{label:'Total',align:'right'}]}>
            {order.lines.map(l=><DetailRow key={l.line_no} tracks={TRACKS}>
              <Cell>
                <Link className={s.itemName} href={`/rep/stock/${encodeURIComponent(l.sku)}`}>{l.description}</Link>
                <div className={s.sub}><span className={s.mono}>{l.sku}</span>{`, ${l.pack}`}</div>
              </Cell>
              <Cell align="right" className={s.num}>{l.qty}</Cell>
              <Cell align="right" className={s.num}>{money(l.unit_price)}</Cell>
              <Cell align="right" className={s.strong}>{money(round2(l.qty*l.unit_price))}</Cell>
            </DetailRow>)}
          </DetailTable>
        </Card>
      </div>
      <div className={s.side}>
        <section className={s.totalBox} aria-labelledby="order-total">
          <div className={s.bigNumber}>{money(order.total)}</div>
          <div id="order-total" className={s.bigLabel}>Order total</div>
          <dl className={s.totalLines}>
            <Fact label="Items">{money(order.subtotal)}</Fact>
            <Fact label="Freight">{money(order.freight)}</Fact>
            <Fact label="Sales tax">{money(order.tax)}</Fact>
          </dl>
        </section>
        <Card id="order-facts" title="Order details">
          <dl className={`${s.facts} ${s.factsBody}`}>
            <Fact label="Customer" href={`/rep/customers/${encodeURIComponent(order.customer_id)}`}>{order.customer_name}</Fact>
            <Fact label="Account" mono>{order.account_number}</Fact>
            <Fact label="Customer PO">{order.po_number??'-'}</Fact>
            <Fact label="Ordered">{day(order.order_date)}</Fact>
            <Fact label="Fulfillment">{fulfillment(order.fulfillment,order.branch_code)}</Fact>
            {order.shipped_on&&<Fact label={willCall?'Picked up':'Shipped'}>{day(order.shipped_on)}</Fact>}
            {order.tracking_number&&<Fact label="Tracking" mono>{order.tracking_number}</Fact>}
            {order.quote_number?<Fact label="From quote" href={`/rep/quotes/${encodeURIComponent(order.quote_number)}`}>{order.quote_number}</Fact>:<Fact label="From quote">Direct order</Fact>}
            <Fact label="Rep">{order.rep_name??'-'}</Fact>
          </dl>
        </Card>
      </div>
    </div>
  </>;
}
