import Link from 'next/link';
import type {CustomerDetail as CustomerView} from '@/server/rep/reference';
import {withCustomer} from '../scope';
import {count,day,fulfillment,money,percent,revision,taxStatus} from '../reference/format';
import {Card,Cell,DetailHeader,DetailRow,DetailTable,EmptyBlock,OrderStatusText,QuoteStatusText,recordStyles as s} from '../reference/parts';

// One customer (plan U5; C_CU3): the account's recent orders and quotes, then the account, its rep and
// its contacts, read-only. Quote statuses are the ones to show now (the page's view stores lazy expiry
// first). A placeholder customer (spec §2) shows its rep and one-line empty states. The detail tables
// have no filter and no columns picker.
//
// No frame (docs/plans/status.md): the Recent orders table (C_CU3 draws the card empty), drawn as its
// Recent quotes table; a contact's phone and email, drawn as the rep's; the quotes empty state and the
// not-on-file account line, drawn as the orders empty state and one plain line.

const QUOTE_TRACKS='1.1fr 1.2fr 1.6fr 1fr';
const ORDER_TRACKS='1.1fr 1.2fr 1.4fr 1fr 1fr';

/** "WAS-1142, rep Brandi Gallegos, Net 30" (C_CU3), with the account number in Geist Mono. */
function facts(view:CustomerView){
  const {account}=view;
  const rest=[account.rep?`rep ${account.rep.name}`:'no rep assigned',account.terms].filter(Boolean).join(', ');
  return <><span className={s.mono}>{account.account_number}</span>{`, ${rest}`}</>;
}

export function CustomerDetail({view,supplierName}:{view:CustomerView;
  /** The supplier's short name, as the empty orders line says it ("…places with Herrick show up here"). */
  supplierName:string}){
  return <>
    <DetailHeader title={view.account.name} subtitle={facts(view)}/>
    <div className={`ui-root ${s.columns}`}>
      <div className={s.main}>
        <RecentOrders view={view} supplierName={supplierName}/>
        <RecentQuotes view={view}/>
      </div>
      <div className={s.side}>
        <AccountCard view={view}/>
        <RepCard view={view}/>
        <ContactsCard view={view}/>
      </div>
    </div>
  </>;
}

function RecentOrders({view,supplierName}:{view:CustomerView;supplierName:string}){
  const {account,orders}=view;
  // "View all" shows this customer's orders, so it picks the customer there.
  const all=orders.count>orders.recent.length?{href:withCustomer('/rep/orders',account.id),label:`View all ${count(orders.count,'order')}`}:undefined;
  return <Card id="customer-orders" title="Recent orders" meta={orders.count?count(orders.count,'order'):undefined} action={all}>
    {orders.recent.length?<DetailTable label={`${account.name}’s newest orders`} tracks={ORDER_TRACKS}
      columns={[{label:'Order'},{label:'Ordered'},{label:'Fulfillment'},{label:'Status'},{label:'Total',align:'right'}]}>
      {orders.recent.map(o=><DetailRow key={o.id} tracks={ORDER_TRACKS}>
        <Cell>
          <Link className={s.name} href={`/rep/orders/${encodeURIComponent(o.order_number)}`}>{o.order_number}</Link>
          {o.po_number&&<div className={s.subTight}>{`PO ${o.po_number}`}</div>}
        </Cell>
        <Cell>{day(o.order_date)}</Cell>
        <Cell>{fulfillment(o.fulfillment,o.branch_code)}</Cell>
        <Cell><OrderStatusText status={o.status}/></Cell>
        <Cell align="right" className={s.bold}>{money(o.total)}</Cell>
      </DetailRow>)}
    </DetailTable>:<EmptyBlock title="No orders yet">{`Orders ${account.name} places with ${supplierName} show up here, read-only from the ERP.`}</EmptyBlock>}
  </Card>;
}

function RecentQuotes({view}:{view:CustomerView}){
  const {account,quotes}=view;
  const all=quotes.count>quotes.recent.length?{href:withCustomer('/rep/quotes',account.id),label:`View all ${count(quotes.count,'quote')}`}:undefined;
  return <Card id="customer-quotes" title="Recent quotes" meta={quotes.count?count(quotes.count,'quote'):undefined} action={all}>
    {quotes.recent.length?<DetailTable label={`${account.name}’s newest quotes`} tracks={QUOTE_TRACKS}
      columns={[{label:'Quote'},{label:'Requested'},{label:'Status'},{label:'Total',align:'right'}]}>
      {quotes.recent.map(q=><DetailRow key={q.id} tracks={QUOTE_TRACKS}>
        <Cell>
          <Link className={s.name} href={`/rep/quotes/${encodeURIComponent(q.quote_number)}`} prefetch={false}>{q.quote_number}</Link>
          <div className={s.subTight}>{`${revision(q.revision)}, ${count(q.line_count,'line')}`}</div>
        </Cell>
        <Cell>{day(q.requested_at)}</Cell>
        <Cell><QuoteStatusText status={q.status}/></Cell>
        <Cell align="right" className={q.sent_total===null?s.notSent:s.sentTotal}>{q.sent_total===null?'Not sent':money(q.sent_total)}</Cell>
      </DetailRow>)}
    </DetailTable>:<EmptyBlock title="No quotes yet">{`A quote shows up here when someone at ${account.name} asks for goods in Querent chat and presses Request quote.`}</EmptyBlock>}
  </Card>;
}

function AccountCard({view}:{view:CustomerView}){
  const {account}=view;
  if(!view.on_file)return <Card id="customer-account" title="Account">
    <div className={s.accountBody}><div className={s.oneLine}>{`Terms, credit and ship-to aren’t on file for ${account.name} yet.`}</div></div>
  </Card>;
  const tax=taxStatus(account.tax_status,account.tax_state);
  const shipTo=account.ship_to;
  const used=view.credit_used;
  const row=(label:string,value:string,under?:string)=><div className={s.fact}>
    <dt>{label}</dt><dd><span className={s.accountValue}>{value}</span>{under&&<div className={s.balanceOf}>{under}</div>}</dd>
  </div>;
  return <Card id="customer-account" title="Account">
    <div className={s.accountBody}>
      <dl className={s.facts}>
        {row('Terms',account.terms??'-')}
        {row('Credit limit',money(account.credit_limit))}
        {row('Open balance',money(account.open_balance))}
        {row('Past due',money(account.past_due_balance))}
        {tax&&row('Tax status',tax)}
        {row('Quote win rate',view.win_rate===null?'-':percent(view.win_rate),view.win_rate===null?undefined:`${view.quotes_won} of ${count(view.quotes_decided,'decided quote')}`)}
        {account.main_phone&&row('Main phone',account.main_phone)}
      </dl>
      {used!==null&&<>
        <div className={s.creditUsed}>Credit used: <b>{percent(used)}</b></div>
        <div className={s.bar} role="img" aria-label={`Credit used: ${percent(used)} of ${money(account.credit_limit)}`}>
          <div className={s.barFill} style={{width:`${Math.min(100,Math.round(used*100))}%`}}/>
        </div>
      </>}
      {shipTo&&<>
        <div className={s.shipToLabel}>Ship-to</div>
        <address className={s.address}>{shipTo.name&&<>{shipTo.name}<br/></>}{shipTo.address}<br/>{[shipTo.city,[shipTo.state,shipTo.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</address>
      </>}
    </div>
  </Card>;
}

function RepCard({view}:{view:CustomerView}){
  const rep=view.account.rep;
  return <Card id="customer-rep" title="Rep">
    <div className={s.personBody}>
      {rep?<>
        <div className={s.personName}>{rep.name}</div>
        <div className={s.personTitle}>{rep.title}</div>
        <div className={s.personPhone}>{rep.phone}</div>
        <a className={s.personEmail} href={`mailto:${rep.email}`}>{rep.email}</a>
      </>:<div className={s.oneLine}>No rep is assigned to this customer.</div>}
    </div>
  </Card>;
}

function ContactsCard({view}:{view:CustomerView}){
  return <Card id="customer-contacts" title="Contacts" meta={view.contacts.length?count(view.contacts.length,'contact'):undefined}>
    <div className={s.personBody}>
      {view.contacts.length?view.contacts.map(c=><div key={c.id} className={s.contact}>
        <div className={s.contactLine}><span className={s.personName}>{c.name}</span>{c.is_primary&&<span className={s.primaryTag}>PRIMARY</span>}</div>
        {c.title&&<div className={s.personTitle}>{c.title}</div>}
        {c.phone&&<div className={s.personPhone}>{c.phone}</div>}
        {c.email&&<a className={s.personEmail} href={`mailto:${c.email}`}>{c.email}</a>}
      </div>):<div className={s.oneLine}>No contacts on file.</div>}
    </div>
  </Card>;
}
