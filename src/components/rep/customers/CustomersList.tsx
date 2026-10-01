import Link from 'next/link';
import type {CustomerDirectoryRow} from '@/domain';
import {RepPageHeader} from '../RepPage';
import {count,day,money} from '../reference/format';
import {Empty,hrefFor,pageStyles as page,referenceStyles as s,type Viewing} from '../reference/parts';

// Customers (spec §4, task 3.8): every account with its one assigned rep, read-only. Placeholder
// customers (spec §2) have a name, account number and rep only, so their other cells say so.
// The "Viewing" picker narrows the list to the picked customer.

export function CustomersList({rows,viewing,repId}:{rows:CustomerDirectoryRow[];viewing:Viewing;
  /** The signed-in rep, whose customers are marked "You". */
  repId:string}){
  return <>
    <RepPageHeader title="Customers" description={`Viewing ${viewing.label} · ${count(rows.length,'customer')}`}/>
    <section className={page.card} aria-label={`Customers: ${viewing.label}`}>
      {rows.length?<div className={s.tableWrap}>
        <table className={s.table}>
          <caption>Customers by name, with each one's assigned rep</caption>
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Rep</th>
              <th scope="col" className={s.wide}>Terms</th>
              <th scope="col" className={`${s.num} ${s.wide}`}>Open balance</th>
              <th scope="col">Last order</th>
              <th scope="col" className={`${s.num} ${s.wide}`}>Orders</th>
              <th scope="col" className={`${s.num} ${s.wide}`}>Quotes</th>
            </tr>
          </thead>
          <tbody>{rows.map(row=><CustomerRow key={row.id} row={row} viewing={viewing} mine={row.rep_id===repId}/>)}</tbody>
        </table>
      </div>:<Empty heading="No customers">Customers come from BOXT’s ERP data.</Empty>}
    </section>
    {viewing.customerId&&<p className={s.note}>Showing {viewing.label} only. Choose All customers under Viewing to see every account.</p>}
  </>;
}

function CustomerRow({row,viewing,mine}:{row:CustomerDirectoryRow;viewing:Viewing;mine:boolean}){
  const onFile=row.terms!==null||row.credit_limit!==null;
  return <tr>
    <th scope="row">
      <Link className={s.name} href={hrefFor(viewing,`/rep/customers/${encodeURIComponent(row.id)}`)}>{row.name}</Link>
      <span className={`${s.sub} ${s.mono}`}>{row.account_number}</span>
    </th>
    <td>{row.rep_name??<span className={s.muted}>Unassigned</span>}{mine&&<span className={s.tag}>You</span>}</td>
    <td className={s.wide}>{onFile?row.terms??'—':<span className={s.muted}>Not on file</span>}</td>
    <td className={`${s.num} ${s.wide}`}>{onFile?<>{money(row.open_balance)}{row.credit_limit!==null&&<span className={s.sub}>of {money(row.credit_limit)}</span>}</>:<span className={s.muted}>—</span>}</td>
    <td className={s.date}>{row.last_order_date?day(row.last_order_date):<span className={s.muted}>No orders yet</span>}</td>
    <td className={`${s.num} ${s.wide}`}>{row.order_count}</td>
    <td className={`${s.num} ${s.wide}`}>{row.quote_count}</td>
  </tr>;
}
