import Link from 'next/link';
import type {CustomerDetail as CustomerView} from '@/server/rep/reference';
import {withCustomer} from '../scope';
import {count,day,fulfillment,money,percent,revision,taxStatus} from '../reference/format';
import {Crumbs,DetailHeader,Empty,OrderStatusChip,Panel,QuoteStatusChip,referenceStyles as s} from '../reference/parts';

// One customer (spec §4, task 3.8): account and terms, the assigned rep, contacts, and the newest
// orders and quotes, read-only. Quote statuses are the ones to show now (the page's view stores
// lazy expiry first). A placeholder customer (spec §2) shows its rep and empty states.

/** Credit used from here reads amber, as in the mockup's .bar.hi. */
const HIGH_CREDIT=0.8;

export function CustomerDetail({view,repId}:{view:CustomerView;repId:string}){
  const {account}=view;
  const rep=account.rep;
  return <>
    <Crumbs section="Customers" href="/rep/customers" current={account.account_number}/>
    <DetailHeader title={account.name} meta={<>
      <span className={s.mono}>{account.account_number}</span>
      {rep?<> · Rep {rep.name}{rep.id===repId&&' (you)'}</>:' · No rep assigned'}
      {account.terms&&<> · {account.terms}</>}
    </>}/>
    <div className={s.grid}>
      <div className={s.main}>
        <RecentOrders view={view}/>
        <RecentQuotes view={view}/>
      </div>
      <aside className={s.rail} aria-label="Account details">
        <AccountPanel view={view}/>
        <Panel id="customer-rep" title="Rep">
          {rep?<div className={s.person}>
            <p className={s.name}>{rep.name}{rep.id===repId&&<span className={s.tag}>You</span>}</p>
            <span className={s.contactLine}>{rep.title}</span>
            <span className={s.contactLine}><span className={s.phone}>{rep.phone}</span></span>
            <span className={s.contactLine}><a href={`mailto:${rep.email}`}>{rep.email}</a></span>
          </div>:<p className={s.emptyInline}>No rep is assigned to this customer.</p>}
        </Panel>
        <Panel id="customer-contacts" title="Contacts" meta={view.contacts.length?count(view.contacts.length,'contact'):undefined}>
          {view.contacts.length?view.contacts.map(c=><div key={c.id} className={s.person}>
            <p className={s.name}>{c.name}{c.is_primary&&<span className={s.tag}>Primary</span>}</p>
            {c.title&&<span className={s.contactLine}>{c.title}</span>}
            {c.phone&&<span className={s.contactLine}><span className={s.phone}>{c.phone}</span></span>}
            {c.email&&<span className={s.contactLine}><a href={`mailto:${c.email}`}>{c.email}</a></span>}
          </div>):<p className={s.emptyInline}>No contacts on file.</p>}
        </Panel>
      </aside>
    </div>
  </>;
}

function AccountPanel({view}:{view:CustomerView}){
  const {account}=view;
  if(!view.on_file)return <Panel id="customer-account" title="Account">
    <p className={s.emptyInline}>Terms, credit and ship-to aren’t on file for {account.name} yet.</p>
  </Panel>;
  const tax=taxStatus(account.tax_status,account.tax_state);
  const shipTo=account.ship_to;
  return <Panel id="customer-account" title="Account">
    <dl className={s.kv}>
      <dt>Terms</dt><dd>{account.terms??'—'}</dd>
      <dt>Credit limit</dt><dd>{money(account.credit_limit)}</dd>
      <dt>Open balance</dt><dd>{money(account.open_balance)}</dd>
      <dt>Past due</dt><dd>{money(account.past_due_balance)}</dd>
      {tax&&<><dt>Tax status</dt><dd>{tax}</dd></>}
      <dt>Quote win rate</dt><dd>{view.win_rate===null?'—':<>{percent(view.win_rate)}<span className={s.sub}>{view.quotes_won} of {count(view.quotes_decided,'decided quote')}</span></>}</dd>
      {account.main_phone&&<><dt>Main phone</dt><dd className={s.phone}>{account.main_phone}</dd></>}
    </dl>
    {view.credit_used!==null&&<div className={s.railSection}>
      Credit used: {percent(view.credit_used)}
      <div className={s.bar} role="img" aria-label={`Credit used: ${percent(view.credit_used)} of ${money(account.credit_limit)}`}>
        <i style={{width:`${Math.min(100,view.credit_used*100)}%`}} data-high={view.credit_used>=HIGH_CREDIT||undefined}/>
      </div>
    </div>}
    {shipTo&&<div className={s.railSection}>
      Ship-to
      <address className={s.address}>{shipTo.name&&<>{shipTo.name}<br/></>}{shipTo.address}<br/>{[shipTo.city,[shipTo.state,shipTo.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</address>
    </div>}
  </Panel>;
}

function RecentOrders({view}:{view:CustomerView}){
  const {account,orders}=view;
  // "View all" shows this customer's orders, so it picks the customer.
  const all=orders.count>orders.recent.length?{href:withCustomer('/rep/orders',account.id),label:`View all ${count(orders.count,'order')}`}:undefined;
  return <Panel id="customer-orders" title="Recent orders" meta={orders.count?count(orders.count,'order'):undefined} action={all} flush>
    {orders.recent.length?<div className={s.tableWrap}><table className={s.table}>
      <caption>{account.name}’s newest orders</caption>
      <thead><tr>
        <th scope="col">Order</th><th scope="col">Ordered</th><th scope="col" className={s.wide}>Fulfillment</th><th scope="col">Status</th><th scope="col" className={s.num}>Total</th>
      </tr></thead>
      <tbody>{orders.recent.map(o=><tr key={o.id}>
        <th scope="row">
          <Link className={s.name} href={`/rep/orders/${encodeURIComponent(o.order_number)}`}>{o.order_number}</Link>
          {o.po_number&&<span className={s.sub}>PO {o.po_number}</span>}
        </th>
        <td className={s.date}>{day(o.order_date)}</td>
        <td className={s.wide}>{fulfillment(o.fulfillment,o.branch_code)}</td>
        <td><OrderStatusChip status={o.status}/></td>
        <td className={s.num}>{money(o.total)}</td>
      </tr>)}</tbody>
    </table></div>:<Empty heading="No orders yet">Orders {account.name} places with Herrick show up here, read-only from the ERP.</Empty>}
  </Panel>;
}

function RecentQuotes({view}:{view:CustomerView}){
  const {account,quotes}=view;
  const all=quotes.count>quotes.recent.length?{href:withCustomer('/rep/quotes',account.id),label:`View all ${count(quotes.count,'quote')}`}:undefined;
  return <Panel id="customer-quotes" title="Recent quotes" meta={quotes.count?count(quotes.count,'quote'):undefined} action={all} flush>
    {quotes.recent.length?<div className={s.tableWrap}><table className={s.table}>
      <caption>{account.name}’s newest quotes, newest request first</caption>
      <thead><tr>
        <th scope="col">Quote</th><th scope="col">Requested</th><th scope="col">Status</th><th scope="col" className={s.num}>Total</th>
      </tr></thead>
      <tbody>{quotes.recent.map(q=><tr key={q.id}>
        <th scope="row">
          <Link className={s.name} href={`/rep/quotes/${encodeURIComponent(q.quote_number)}`} prefetch={false}>{q.quote_number}</Link>
          <span className={s.sub}>{revision(q.revision)} · {count(q.line_count,'line')}</span>
        </th>
        <td className={s.date}>{day(q.requested_at)}</td>
        <td><QuoteStatusChip status={q.status}/></td>
        <td className={s.num}>{q.sent_total===null?<span className={s.muted}>Not sent</span>:money(q.sent_total)}</td>
      </tr>)}</tbody>
    </table></div>:<Empty heading="No quotes yet">A quote shows up here when someone at {account.name} asks for goods in Querent chat and presses Request quote.</Empty>}
  </Panel>;
}
