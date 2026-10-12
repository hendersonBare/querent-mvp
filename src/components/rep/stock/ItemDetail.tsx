import Link from 'next/link';
import type {AddToQuoteTarget} from '@/server/rep/add-to-quote';
import type {ItemDetail as ItemView} from '@/server/rep/reference';
import {count,day,money} from '../reference/format';
import {Card,Cell,DetailHeader,DetailRow,DetailTable,Fact,recordStyles as s} from '../reference/parts';
import {AddToQuoteButton} from './AddToQuoteButton';

// One item (plan U5; C_ST2, C_ST3): stock at each branch with what is on order, its recent orders at
// the prices paid, the list price box with Add to quote, and the item details, read-only. Recent
// orders are the rep's own customers' (every customer's for the manager, task U1). No cost or margin.
// The detail tables have no filter and no columns picker.
//
// No frame (docs/plans/status.md): the one-line empty recent orders.

const STOCK_TRACKS='1fr 130px 130px 150px';
const SALES_TRACKS='1.1fr 2fr 1.2fr 0.6fr 1fr';

export function ItemDetail({view,allCustomers,targets}:{view:ItemView;
  /** The sales cover every customer (the manager), not only the rep's own. */
  allCustomers:boolean;
  /** The signed-in rep's own drafts, for Add to quote. */
  targets:AddToQuoteTarget[]}){
  const {item,branches,sales}=view;
  const onOrder=item.stock.reduce((sum,b)=>sum+b.on_order,0);
  return <>
    <DetailHeader title={item.description} subtitle={<><span className={s.mono}>{item.sku}</span>{`, ${item.category_name}, ${item.pack}`}</>}/>
    <div className={`ui-root ${s.columns}`}>
      <div className={`${s.main} ${s.mainWide}`}>
        <Card id="item-stock" title="Stock by branch" meta={`${item.total_available} available`}>
          <DetailTable label={`${item.sku} stock at each branch`} tracks={STOCK_TRACKS}
            columns={[{label:'Branch'},{label:'Available',align:'right'},{label:'On order',align:'right'},{label:'Next receipt',align:'right'}]}>
            {branches.map(b=>{
              const at=item.stock.find(x=>x.branch_id===b.id);
              return <DetailRow key={b.id} tracks={STOCK_TRACKS} className={s.semiboldRow}>
                <Cell>{b.name}{b.code!==b.name&&<div className={s.branchCode}>{b.code}</div>}</Cell>
                <Cell align="right" className={s.num}>{at?.available??0}</Cell>
                <Cell align="right" className={s.num}>{at?.on_order??0}</Cell>
                <Cell align="right" className={s.dash}>{at?.next_receipt_on?day(at.next_receipt_on):'-'}</Cell>
              </DetailRow>;
            })}
            <DetailRow tracks={STOCK_TRACKS} className={s.totalRow}>
              <Cell>All branches</Cell>
              <Cell align="right" className={s.num}>{item.total_available}</Cell>
              <Cell align="right" className={s.num}>{onOrder}</Cell>
              <Cell align="right" className={s.dash}/>
            </DetailRow>
          </DetailTable>
        </Card>
        <Card id="item-sales" title="Recent orders" meta={allCustomers?'All customers':'Your customers'}>
          {sales.length?<DetailTable label={`Recent orders of ${item.sku}, newest first, with the prices paid`} tracks={SALES_TRACKS}
            columns={[{label:'Order'},{label:'Customer'},{label:'Ordered'},{label:'Qty',align:'right'},{label:'Price paid',align:'right'}]}>
            {sales.map((sale,i)=><DetailRow key={`${sale.order_id}-${i}`} tracks={SALES_TRACKS}>
              <Cell><Link className={s.name} href={`/rep/orders/${encodeURIComponent(sale.order_number)}`}>{sale.order_number}</Link></Cell>
              <Cell className={s.customerName}>{sale.customer_name}</Cell>
              <Cell>{day(sale.order_date)}</Cell>
              <Cell align="right" className={s.num}>{sale.qty}</Cell>
              <Cell align="right" className={s.strong}>{money(sale.unit_price)}</Cell>
            </DetailRow>)}
          </DetailTable>:<p className={s.empty}>{allCustomers?'No orders for this item yet.':'None of your customers has ordered this item yet.'}</p>}
        </Card>
      </div>
      <div className={s.side}>
        <section className={s.totalBox} aria-label="List price">
          <div className={s.bigNumber}>{money(item.list_price)}</div>
          <div className={s.bigLabel}>{`List price per ${item.pack.charAt(0).toLowerCase()}${item.pack.slice(1)}`}</div>
          <div className={s.inStock}><span>In stock, all branches</span><span>{item.total_available}</span></div>
          <AddToQuoteButton item={item} targets={targets}/>
        </section>
        <Card id="item-facts" title="Item details">
          <dl className={`${s.facts} ${s.factsBody}`}>
            <Fact label="SKU" mono>{item.sku}</Fact>
            <Fact label="Category">{item.category_name}</Fact>
            <Fact label="Sold as">{item.pack}</Fact>
            <Fact label="Full case">{count(item.case_qty,'pack')}</Fact>
            <Fact label="List price">{money(item.list_price)}</Fact>
          </dl>
        </Card>
      </div>
    </div>
  </>;
}
