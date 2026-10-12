import Link from 'next/link';
import type {ItemDetail as ItemView} from '@/server/rep/reference';
import {count,day,money} from '../reference/format';
import {Crumbs,DetailHeader,Empty,Panel,referenceStyles as s,Stock} from '../reference/parts';

// One item (spec §4, task 3.8): list price, pack and category, stock at each branch with what's on
// order, and its recent sales at the prices paid, read-only. Recent orders are the rep's own
// customers' (every customer's for the manager, task U1). No cost or margin.

export function ItemDetail({view,allCustomers}:{view:ItemView;
  /** The sales cover every customer (the manager), not only the rep's own. */
  allCustomers:boolean}){
  const {item,branches,sales}=view;
  const onOrder=item.stock.reduce((sum,b)=>sum+b.on_order,0);
  return <>
    <Crumbs section="Stock" href="/rep/stock" current={item.sku}/>
    <DetailHeader title={item.description} meta={<><span className={s.mono}>{item.sku}</span> · {item.category_name} · {item.pack}</>}/>
    <div className={s.grid}>
      <div className={s.main}>
        <Panel id="item-stock" title="Stock by branch" meta={`${item.total_available} available`} flush>
          <div className={s.tableWrap}><table className={s.table}>
            <caption>{item.sku} stock at each branch</caption>
            <thead><tr>
              <th scope="col">Branch</th><th scope="col" className={s.num}>Available</th><th scope="col" className={s.num}>On order</th><th scope="col" className={s.num}>Next receipt</th>
            </tr></thead>
            <tbody>{branches.map(b=>{
              const at=item.stock.find(x=>x.branch_id===b.id);
              return <tr key={b.id}>
                <th scope="row">{b.name}{b.code!==b.name&&<span className={s.sub}>{b.code}</span>}</th>
                <td className={s.num}><Stock available={at?.available??0}/></td>
                <td className={s.num}>{at?.on_order??0}</td>
                <td className={s.num}>{at?.next_receipt_on?day(at.next_receipt_on):<span className={s.muted}>—</span>}</td>
              </tr>;
            })}</tbody>
            <tfoot><tr>
              <th scope="row">All branches</th><td className={s.num}>{item.total_available}</td><td className={s.num}>{onOrder}</td><td/>
            </tr></tfoot>
          </table></div>
        </Panel>
        <Panel id="item-sales" title="Recent orders" meta={allCustomers?'All customers':'Your customers'} flush>
          {sales.length?<div className={s.tableWrap}><table className={s.table}>
            <caption>Recent orders of {item.sku}, newest first, with the prices paid</caption>
            <thead><tr>
              <th scope="col">Order</th><th scope="col" className={s.wide}>Customer</th><th scope="col">Ordered</th><th scope="col" className={s.num}>Qty</th><th scope="col" className={s.num}>Price paid</th>
            </tr></thead>
            <tbody>{sales.map((sale,i)=><tr key={`${sale.order_id}-${i}`}>
              <th scope="row"><Link className={s.name} href={`/rep/orders/${encodeURIComponent(sale.order_number)}`}>{sale.order_number}</Link></th>
              <td className={s.wide}>{sale.customer_name}</td>
              <td className={s.date}>{day(sale.order_date)}</td>
              <td className={s.num}>{sale.qty}</td>
              <td className={s.num}>{money(sale.unit_price)}</td>
            </tr>)}</tbody>
          </table></div>:<Empty heading={allCustomers?'No orders for this item yet':'None of your customers has ordered this item yet'}/>}
        </Panel>
      </div>
      <aside className={s.rail} aria-label="Item details">
        <Panel id="item-facts" title="Item">
          <dl className={s.kv}>
            <dt>SKU</dt><dd className={s.mono}>{item.sku}</dd>
            <dt>Category</dt><dd>{item.category_name}</dd>
            <dt>Sold as</dt><dd>{item.pack}</dd>
            <dt>Full case</dt><dd>{count(item.case_qty,'pack')}</dd>
            <dt>List price</dt><dd className={s.strong}>{money(item.list_price)}</dd>
          </dl>
        </Panel>
      </aside>
    </div>
  </>;
}
