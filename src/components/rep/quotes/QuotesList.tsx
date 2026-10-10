'use client';
import {useCallback} from 'react';
import Link from 'next/link';
import {ChevronRight} from 'lucide-react';
import type {QuoteStatus} from '@/domain';
import {usePoll} from '@/lib/use-poll';
import type {AttentionSort,RepQuoteList,RepQuoteRow} from '@/server/rep/quotes';
import {useRepScope} from '../context';
import {RepPageHeader,repPageStyles as page} from '../RepPage';
import {BADGE_POLL_MS} from '../RepShell';
import {SCOPE_PARAM} from '../scope';
import {AgingMarker} from './AgingMarker';
import {ATTENTION_PARAM,EMPTY_ATTENTION,EMPTY_STATUS,REP_STATUS,SORT_PARAM,STATUS_FILTERS,STATUS_PARAM,belowFloorNote,listDate,money,revisionLabel,totalNote,unreadLabel} from './labels';
import s from './QuotesList.module.css';

// The rep's queue (spec §4, task 3.2): every quote of the signed-in rep with its status,
// customer, requested date, total and margin, newest request first. It follows the "Viewing"
// picker (?customer=) and a status filter (?status=). Quotes where the customer asked for changes
// are highlighted with their note; unread quotes carry a dot until the rep opens them.
// Aging quotes carry an Aging or Overdue marker, and the Needs attention filter (?attention=1)
// lists only those, most urgent first or oldest first (v3 spec §3, §6; task A2).

/** How often the list is re-read, in step with the Quotes badge, so a new request shows up without a reload. */
export const LIST_POLL_MS=BADGE_POLL_MS;

/** The Needs attention view and its order, or null for the status filter. */
export type AttentionView={attention:true;sort:AttentionSort}|null;

/** The list page's own path and query for a status, or for the Needs attention view (the scope adds ?customer=). */
const listHref=(status:QuoteStatus|null,view:AttentionView=null)=>view
  ?`/rep/quotes?${ATTENTION_PARAM}=1${view.sort==='oldest'?`&${SORT_PARAM}=oldest`:''}`
  :status?`/rep/quotes?${STATUS_PARAM}=${status}`:'/rep/quotes';

/** GET /api/rep/quotes for the picked customer and status, or the Needs attention view. */
export function quotesApiPath(customerId:string|null,status:QuoteStatus|null,view:AttentionView=null){
  const params=new URLSearchParams();
  if(customerId)params.set(SCOPE_PARAM,customerId);
  if(view){params.set(ATTENTION_PARAM,'1');if(view.sort==='oldest')params.set(SORT_PARAM,'oldest');}
  else if(status)params.set(STATUS_PARAM,status);
  const query=params.toString();
  return query?`/api/rep/quotes?${query}`:'/api/rep/quotes';
}

async function loadQuotes(customerId:string|null,status:QuoteStatus|null,view:AttentionView):Promise<RepQuoteList>{
  const response=await fetch(quotesApiPath(customerId,status,view),{cache:'no-store'});
  if(response.status===401||response.status===403){window.location.assign('/');throw new Error('Choose a demo workspace.');}
  if(!response.ok)throw new Error('Unable to refresh quotes.');
  return response.json();
}

/** The Quotes page. `initial` is the list the server rendered for this URL; the page then keeps it fresh. */
export function QuotesList({initial}:{initial:RepQuoteList}){
  const customerId=initial.customer?.id??null,status=initial.status,attention=initial.attention,sort=initial.sort;
  const load=useCallback(()=>loadQuotes(customerId,status,attention?{attention,sort}:null),[customerId,status,attention,sort]);
  const {data,error}=usePoll(load,LIST_POLL_MS);
  const list=data??initial;
  const label=list.customer?.name??'All customers';
  return <>
    <RepPageHeader title="Quotes" description={<>Viewing {label}{list.unread>0&&<> · {unreadLabel(list.unread)}</>}</>}/>
    {list.counts.all>0&&<StatusFilter list={list}/>}
    {list.attention&&list.rows.length>0&&<SortToggle list={list}/>}
    {error&&<p className={s.problem} role="status">{error} Trying again in a few seconds.</p>}
    <section className={`${page.card} ${s.card}`} aria-label={`Quotes for ${label}`}>
      {list.rows.length?<QuotesTable list={list}/>:<EmptyQuotes list={list}/>}
    </section>
  </>;
}

function StatusFilter({list}:{list:RepQuoteList}){
  const scope=useRepScope();
  const link=(status:QuoteStatus|null,text:string,count:number)=><Link key={status??'all'} className={s.filter} href={scope.href(listHref(status))}
    aria-current={!list.attention&&list.status===status?'page':undefined} data-empty={count===0||undefined}>{text}<span className={s.filterCount}>{count}</span></Link>;
  return <nav className={s.filters} aria-label="Filter by status">
    {link(null,'All',list.counts.all)}
    <Link className={s.filter} href={scope.href(listHref(null,{attention:true,sort:'urgent'}))} aria-current={list.attention?'page':undefined}
      data-attention="" data-empty={list.attention_count===0||undefined}>Needs attention<span className={s.filterCount}>{list.attention_count}</span></Link>
    {STATUS_FILTERS.map(status=>link(status,REP_STATUS[status].label,list.counts[status]))}
  </nav>;
}

/** The Needs attention view's order (decision 18): most urgent (red, amber, then the largest total) or oldest first. */
function SortToggle({list}:{list:RepQuoteList}){
  const scope=useRepScope();
  const option=(sort:AttentionSort,text:string)=><Link href={scope.href(listHref(null,{attention:true,sort}))} aria-current={list.sort===sort?'page':undefined}>{text}</Link>;
  return <div className={s.sortbar}>
    <span aria-hidden="true">Sort</span>
    <nav aria-label="Sort quotes needing attention">{option('urgent','Most urgent')}{option('oldest','Oldest first')}</nav>
  </div>;
}

export function StatusChip({status}:{status:QuoteStatus}){
  const {label,tone}=REP_STATUS[status];
  return <span className={s.chip} data-tone={tone}>{label}</span>;
}

function QuotesTable({list}:{list:RepQuoteList}){
  const scope=useRepScope();
  const who=list.customer?list.customer.name:'all your customers';
  const caption=list.attention
    ?`Quotes needing attention for ${who}, ${list.sort==='oldest'?'oldest first':'overdue first, then the largest totals'}`
    :`${list.status?`${REP_STATUS[list.status].label} quotes`:'Quotes'} for ${who}, newest request first`;
  return <table className={s.table} role="table">
    <caption className={s.srOnly}>{caption}</caption>
    <thead role="rowgroup">
      <tr role="row">
        <th role="columnheader" scope="col">Quote</th>
        <th role="columnheader" scope="col">Customer</th>
        <th role="columnheader" scope="col">Requested</th>
        <th role="columnheader" scope="col">Status</th>
        <th role="columnheader" scope="col" className={s.num}>Total</th>
        <th role="columnheader" scope="col" className={s.num}>Margin</th>
        {/* The chevron column is decoration: the quote number is the link that opens the row. */}
        <th className={s.go} aria-hidden="true"/>
      </tr>
    </thead>
    {list.rows.map(row=><QuoteRow key={row.id} row={row} asOf={list.as_of} href={scope.href(`/rep/quotes/${encodeURIComponent(row.quote_number)}`)}/>)}
  </table>;
}

function QuoteRow({row,asOf,href}:{row:RepQuoteRow;asOf:string;href:string}){
  const noteId=`quote-${row.id}-changes`;
  const total=totalNote(row),floor=row.total_basis==='draft'?belowFloorNote(row.below_floor_count):null;
  return <tbody role="rowgroup" className={s.quote} data-status={row.status} data-unread={row.unread||undefined}>
    <tr role="row" aria-describedby={row.change_request?noteId:undefined}>
      <th role="rowheader" scope="row" className={s.number}>
        {row.unread&&<span className={s.dot}><span className={s.srOnly}>Unread: </span></span>}
        {/* The whole row opens the quote (the link stretches over it); no prefetch, since the quote page marks it read. */}
        <Link className={s.open} href={href} prefetch={false}>{row.quote_number}</Link>
        <span className={s.sub}>{revisionLabel(row.revision)}{row.is_sample&&<span className={s.tag}>Sample data</span>}</span>
      </th>
      <td role="cell" className={s.customer}>{row.customer_name}{row.account_number&&<span className={`${s.sub} ${s.mono}`}>{row.account_number}</span>}</td>
      <td role="cell" className={s.date}><span className={s.cellWord}>Requested </span><time dateTime={row.requested_at}>{listDate(row.requested_at,asOf)}</time></td>
      <td role="cell" className={s.status}><span className={s.statusStack}><StatusChip status={row.status}/><AgingMarker aging={row.aging}/></span></td>
      <td role="cell" className={`${s.num} ${s.total}`}>{money(row.total)}{total&&<span className={s.sub}>{total}</span>}</td>
      <td role="cell" className={`${s.num} ${s.margin}`} data-low={floor?true:undefined}>
        {row.margin_label}<span className={s.cellWord}> margin</span>{floor&&<span className={`${s.sub} ${s.floor}`}>{floor}</span>}
      </td>
      <td role="cell" className={s.go} aria-hidden="true"><ChevronRight size={16} strokeWidth={1.8}/></td>
    </tr>
    {row.change_request&&<tr role="row" className={s.noteRow}>
      <td role="cell" colSpan={7}>
        <p className={s.note} id={noteId}>
          <span className={s.noteWho}>{row.change_request.by??'The customer'} asked for changes{row.change_request.at&&<> · {listDate(row.change_request.at,asOf)}</>}</span>
          <q className={s.noteText}>{row.change_request.note}</q>
        </p>
      </td>
    </tr>}
  </tbody>;
}

function EmptyQuotes({list}:{list:RepQuoteList}){
  const scope=useRepScope();
  const {customer}=list;
  let heading:string,body:string,action:{href:string;label:string}|null=null;
  if(customer&&list.other_rep&&list.counts.all===0){
    heading=`${customer.name} is ${customer.rep_name?`${customer.rep_name}’s`:'another rep’s'} customer`;
    body='Your Quotes list shows quotes for your own customers. A quote stays with the rep it was requested for.';
    action={href:'/rep/quotes',label:'Show all your quotes'};
  }else if(list.attention&&list.counts.all>0){
    ({heading,body}=EMPTY_ATTENTION);
    action={href:scope.href('/rep/quotes'),label:'Show every status'};
  }else if(list.status&&list.counts.all>0){
    ({heading,body}=EMPTY_STATUS[list.status]);
    action={href:scope.href('/rep/quotes'),label:'Show every status'};
  }else if(customer){
    heading=`No quotes for ${customer.name} yet`;
    body=`A quote shows up here when someone at ${customer.name} asks for goods in Querent chat and presses Request quote.`;
  }else{
    heading='No quotes yet';
    body='A quote shows up here when one of your customers asks for goods in Querent chat and presses Request quote.';
  }
  return <div className={page.empty}>
    <h2>{heading}</h2>
    <p>{body}</p>
    {action&&<Link className={s.emptyAction} href={action.href}>{action.label}</Link>}
  </div>;
}
