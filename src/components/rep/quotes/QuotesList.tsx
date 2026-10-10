'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ChevronRight} from 'lucide-react';
import type {QuoteStatus} from '@/domain';
import {usePoll} from '@/lib/use-poll';
import type {ReassignResult} from '@/server/rep/reassign';
import type {AttentionSort,RepQuoteList,RepQuoteRow} from '@/server/rep/quotes';
import {useRepPortal,useRepScope} from '../context';
import {ReassignDialog} from '../reassign/ReassignDialog';
import {RepPageHeader,repPageStyles as page} from '../RepPage';
import {BADGE_POLL_MS} from '../RepShell';
import {ALL_REPS,REPS_PARAM,REP_PARAM,SCOPE_PARAM,TEAM_PARAM} from '../scope';
import {AgingMarker} from './AgingMarker';
import {ATTENTION_PARAM,EMPTY_ATTENTION,EMPTY_STATUS,REP_STATUS,SORT_PARAM,STATUS_FILTERS,STATUS_PARAM,belowFloorNote,listDate,money,reassignedLabel,revisionLabel,totalNote,unreadLabel} from './labels';
import s from './QuotesList.module.css';

// The rep's queue (spec §4, task 3.2): every quote of the signed-in rep with its status,
// customer, requested date, total and margin, newest request first. It follows the "Viewing"
// picker (?customer=) and a status filter (?status=). Quotes where the customer asked for changes
// are highlighted with their note; unread quotes carry a dot until the rep opens them.
// Aging quotes carry an Aging or Overdue marker, and the Needs attention filter (?attention=1)
// lists only those, most urgent first or oldest first (v3 spec §3, §6; task A2).
// The manager (v3 spec §6; decisions 21, 22; task D2) also gets a "My quotes / All reps" switch
// (?scope=all), a Rep column with rep and team filters (?rep=, ?team=) in All reps, and row
// checkboxes with a "Reassign…" bulk action.

/** How often the list is re-read, in step with the Quotes badge, so a new request shows up without a reload. */
export const LIST_POLL_MS=BADGE_POLL_MS;

/** The Needs attention view and its order, or null for the status filter. */
export type AttentionView={attention:true;sort:AttentionSort}|null;

/** The All reps scope's filters (task D2): a rep, a team label, or neither. */
export type RepFilters={rep:string|null;team:string|null};

/** The list page's own path and query for a status or the Needs attention view, with the All reps filters (the scope adds ?customer= and ?scope=all). */
function listHref(status:QuoteStatus|null,view:AttentionView=null,filters:RepFilters|null=null){
  const params=new URLSearchParams();
  if(view){params.set(ATTENTION_PARAM,'1');if(view.sort==='oldest')params.set(SORT_PARAM,'oldest');}
  else if(status)params.set(STATUS_PARAM,status);
  if(filters?.rep)params.set(REP_PARAM,filters.rep);
  if(filters?.team)params.set(TEAM_PARAM,filters.team);
  const query=params.toString();
  return query?`/rep/quotes?${query}`:'/rep/quotes';
}

/** GET /api/rep/quotes for the picked customer and status, or the Needs attention view; with `reps`, the manager's All reps scope and its filters. */
export function quotesApiPath(customerId:string|null,status:QuoteStatus|null,view:AttentionView=null,reps:RepFilters|null=null){
  const params=new URLSearchParams();
  if(customerId)params.set(SCOPE_PARAM,customerId);
  if(view){params.set(ATTENTION_PARAM,'1');if(view.sort==='oldest')params.set(SORT_PARAM,'oldest');}
  else if(status)params.set(STATUS_PARAM,status);
  if(reps){
    params.set(REPS_PARAM,ALL_REPS);
    if(reps.rep)params.set(REP_PARAM,reps.rep);
    if(reps.team)params.set(TEAM_PARAM,reps.team);
  }
  const query=params.toString();
  return query?`/api/rep/quotes?${query}`:'/api/rep/quotes';
}

async function loadQuotes(customerId:string|null,status:QuoteStatus|null,view:AttentionView,reps:RepFilters|null):Promise<RepQuoteList>{
  const response=await fetch(quotesApiPath(customerId,status,view,reps),{cache:'no-store'});
  if(response.status===401||response.status===403){window.location.assign('/');throw new Error('Choose a demo workspace.');}
  if(!response.ok)throw new Error('Unable to refresh quotes.');
  return response.json();
}

/** The filters a list's links keep: the All reps scope's rep and team, or none. */
const filtersOf=(list:RepQuoteList):RepFilters|null=>list.scope==='all'?{rep:list.rep_filter,team:list.team_filter}:null;

/** The manager's row checkboxes (task D2). */
interface Selection {picked:ReadonlySet<string>;toggle:(id:string)=>void;toggleAll:()=>void}

/** The Quotes page. `initial` is the list the server rendered for this URL; the page then keeps it fresh. */
export function QuotesList({initial}:{initial:RepQuoteList}){
  const {refreshBadges}=useRepPortal();
  const customerId=initial.customer?.id??null,status=initial.status,attention=initial.attention,sort=initial.sort;
  const all=initial.scope==='all',repFilter=initial.rep_filter,teamFilter=initial.team_filter;
  const load=useCallback(()=>loadQuotes(customerId,status,attention?{attention,sort}:null,all?{rep:repFilter,team:teamFilter}:null),
    [customerId,status,attention,sort,all,repFilter,teamFilter]);
  const {data,error,refresh}=usePoll(load,LIST_POLL_MS);
  const list=data??initial;
  const label=list.customer?.name??'All customers';
  // The manager's ticked quotes (task D2), kept to the ones still shown.
  const [picked,setPicked]=useState<ReadonlySet<string>>(()=>new Set());
  const [reassigning,setReassigning]=useState(false);
  const [notice,setNotice]=useState('');
  const shown=useMemo(()=>list.rows.map(r=>r.id),[list.rows]);
  useEffect(()=>{setPicked(current=>{const kept=new Set([...current].filter(id=>shown.includes(id)));return kept.size===current.size?current:kept;});},[shown]);
  const toggle=useCallback((id:string)=>setPicked(current=>{const next=new Set(current);if(!next.delete(id))next.add(id);return next;}),[]);
  const toggleAll=useCallback(()=>setPicked(current=>current.size===shown.length?new Set():new Set(shown)),[shown]);
  const selection=useMemo<Selection|null>(()=>list.manager?{picked,toggle,toggleAll}:null,[list.manager,picked,toggle,toggleAll]);
  function done(result:ReassignResult){
    setReassigning(false);setPicked(new Set());setNotice(reassignedLabel(result));
    void refresh();refreshBadges();
  }
  return <>
    <RepPageHeader title="Quotes" description={<>Viewing {label}{list.unread>0&&<> · {unreadLabel(list.unread)}</>}</>}/>
    {list.manager&&<ScopeBar list={list}/>}
    {list.counts.all>0&&<StatusFilter list={list}/>}
    {list.attention&&list.rows.length>0&&<SortToggle list={list}/>}
    {error&&<p className={s.problem} role="status">{error} Trying again in a few seconds.</p>}
    {list.manager&&<p className={s.notice} role="status" aria-label="Reassignment">{notice}</p>}
    {selection&&picked.size>0&&<section className={s.bulk} aria-label="Selected quotes">
      <span className={s.bulkCount}>{picked.size} selected</span>
      <button type="button" className={s.bulkGo} onClick={()=>{setNotice('');setReassigning(true);}}>Reassign…</button>
      <button type="button" className={s.bulkClear} onClick={()=>setPicked(new Set())}>Clear</button>
    </section>}
    <section className={`${page.card} ${s.card}`} aria-label={`Quotes for ${label}`}>
      {list.rows.length?<QuotesTable list={list} selection={selection}/>:<EmptyQuotes list={list}/>}
    </section>
    {reassigning&&list.manager&&<ManagerReassign list={list} picked={picked} onClose={()=>setReassigning(false)} onDone={done}/>}
  </>;
}

/** The Reassign dialog for the ticked quotes: any active rep, except the one who already has them all (task D2). */
function ManagerReassign({list,picked,onClose,onDone}:{list:RepQuoteList;picked:ReadonlySet<string>;onClose:()=>void;onDone:(result:ReassignResult)=>void}){
  const {rep}=useRepPortal();
  const rows=list.rows.filter(r=>picked.has(r.id));
  const owners=new Set(rows.map(r=>r.rep_id));
  const targets=(list.manager?.reps??[]).filter(r=>r.active).map(({id,name})=>({id,name}));
  return <ReassignDialog quotes={rows.map(({id,quote_number})=>({id,quote_number}))} targets={targets} me={rep.id}
    currentRep={owners.size===1?[...owners][0]:null} onClose={onClose} onDone={onDone}/>;
}

/** The manager's "My quotes / All reps" switch, and in All reps the rep and team filters (task D2). */
function ScopeBar({list}:{list:RepQuoteList}){
  const scope=useRepScope();
  const router=useRouter();
  const all=list.scope==='all';
  const view:AttentionView=list.attention?{attention:true,sort:list.sort}:null;
  const go=(filters:RepFilters)=>router.push(scope.href(listHref(list.status,view,filters),true));
  return <div className={s.scopebar}>
    <nav className={s.scopeSwitch} aria-label="Whose quotes">
      <Link href={scope.href('/rep/quotes',false)} aria-current={all?undefined:'page'}>My quotes</Link>
      <Link href={scope.href('/rep/quotes',true)} aria-current={all?'page':undefined}>All reps</Link>
    </nav>
    {all&&list.manager&&<>
      <label className={s.scopeFilter}>Rep
        <select value={list.rep_filter??''} onChange={event=>go({rep:event.target.value||null,team:list.team_filter})}>
          <option value="">All reps</option>
          {list.manager.reps.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      {list.manager.teams.length>0&&<label className={s.scopeFilter}>Team
        <select value={list.team_filter??''} onChange={event=>go({rep:list.rep_filter,team:event.target.value||null})}>
          <option value="">All teams</option>
          {list.manager.teams.map(team=><option key={team} value={team}>{team}</option>)}
        </select>
      </label>}
    </>}
  </div>;
}

function StatusFilter({list}:{list:RepQuoteList}){
  const scope=useRepScope();
  const filters=filtersOf(list);
  const link=(status:QuoteStatus|null,text:string,count:number)=><Link key={status??'all'} className={s.filter} href={scope.href(listHref(status,null,filters))}
    aria-current={!list.attention&&list.status===status?'page':undefined} data-empty={count===0||undefined}>{text}<span className={s.filterCount}>{count}</span></Link>;
  return <nav className={s.filters} aria-label="Filter by status">
    {link(null,'All',list.counts.all)}
    <Link className={s.filter} href={scope.href(listHref(null,{attention:true,sort:'urgent'},filters))} aria-current={list.attention?'page':undefined}
      data-attention="" data-empty={list.attention_count===0||undefined}>Needs attention<span className={s.filterCount}>{list.attention_count}</span></Link>
    {STATUS_FILTERS.map(status=>link(status,REP_STATUS[status].label,list.counts[status]))}
  </nav>;
}

/** The Needs attention view's order (decision 18): most urgent (red, amber, then the largest total) or oldest first. */
function SortToggle({list}:{list:RepQuoteList}){
  const scope=useRepScope();
  const option=(sort:AttentionSort,text:string)=><Link href={scope.href(listHref(null,{attention:true,sort},filtersOf(list)))} aria-current={list.sort===sort?'page':undefined}>{text}</Link>;
  return <div className={s.sortbar}>
    <span aria-hidden="true">Sort</span>
    <nav aria-label="Sort quotes needing attention">{option('urgent','Most urgent')}{option('oldest','Oldest first')}</nav>
  </div>;
}

export function StatusChip({status}:{status:QuoteStatus}){
  const {label,tone}=REP_STATUS[status];
  return <span className={s.chip} data-tone={tone}>{label}</span>;
}

/** Whose quotes a caption names: "all your customers", or in All reps "all customers of every rep". */
function captionWho(list:RepQuoteList){
  if(list.scope!=='all')return list.customer?list.customer.name:'all your customers';
  const reps=list.rep_filter?list.manager?.reps.find(r=>r.id===list.rep_filter)?.name??'one rep':list.team_filter?`the ${list.team_filter} team`:'every rep';
  return `${list.customer?list.customer.name:'all customers'} of ${reps}`;
}

function QuotesTable({list,selection}:{list:RepQuoteList;selection:Selection|null}){
  const scope=useRepScope();
  const who=captionWho(list);
  const showRep=list.scope==='all';
  const caption=list.attention
    ?`Quotes needing attention for ${who}, ${list.sort==='oldest'?'oldest first':'overdue first, then the largest totals'}`
    :`${list.status?`${REP_STATUS[list.status].label} quotes`:'Quotes'} for ${who}, newest request first`;
  const everyPicked=!!selection&&list.rows.length>0&&list.rows.every(r=>selection.picked.has(r.id));
  return <table className={s.table} role="table" data-pick={selection?'':undefined}>
    <caption className={s.srOnly}>{caption}</caption>
    <thead role="rowgroup">
      <tr role="row">
        {selection&&<th role="columnheader" scope="col" className={s.pick}>
          <input type="checkbox" aria-label="Select every quote shown" checked={everyPicked} onChange={selection.toggleAll}/><span className={s.srOnly}>Select</span>
        </th>}
        <th role="columnheader" scope="col">Quote</th>
        <th role="columnheader" scope="col">Customer</th>
        {showRep&&<th role="columnheader" scope="col">Rep</th>}
        <th role="columnheader" scope="col">Requested</th>
        <th role="columnheader" scope="col">Status</th>
        <th role="columnheader" scope="col" className={s.num}>Total</th>
        <th role="columnheader" scope="col" className={s.num}>Margin</th>
        {/* The chevron column is decoration: the quote number is the link that opens the row. */}
        <th className={s.go} aria-hidden="true"/>
      </tr>
    </thead>
    {list.rows.map(row=><QuoteRow key={row.id} row={row} asOf={list.as_of} href={scope.href(`/rep/quotes/${encodeURIComponent(row.quote_number)}`)}
      showRep={showRep} selection={selection}/>)}
  </table>;
}

function QuoteRow({row,asOf,href,showRep,selection}:{row:RepQuoteRow;asOf:string;href:string;showRep:boolean;selection:Selection|null}){
  const noteId=`quote-${row.id}-changes`;
  const total=totalNote(row),floor=row.total_basis==='draft'?belowFloorNote(row.below_floor_count):null;
  return <tbody role="rowgroup" className={s.quote} data-status={row.status} data-unread={row.unread||undefined}>
    <tr role="row" aria-describedby={row.change_request?noteId:undefined}>
      {selection&&<td role="cell" className={s.pick}>
        <input type="checkbox" aria-label={`Select ${row.quote_number}`} checked={selection.picked.has(row.id)} onChange={()=>selection.toggle(row.id)}/>
      </td>}
      <th role="rowheader" scope="row" className={s.number}>
        {row.unread&&<span className={s.dot}><span className={s.srOnly}>Unread: </span></span>}
        {/* The whole row opens the quote (the link stretches over it); no prefetch, since the quote page marks it read. */}
        <Link className={s.open} href={href} prefetch={false}>{row.quote_number}</Link>
        <span className={s.sub}>{revisionLabel(row.revision)}{row.is_sample&&<span className={s.tag}>Sample data</span>}</span>
      </th>
      <td role="cell" className={s.customer}>{row.customer_name}{row.account_number&&<span className={`${s.sub} ${s.mono}`}>{row.account_number}</span>}</td>
      {showRep&&<td role="cell" className={s.rep}><span className={s.cellWord}>Rep </span>{row.rep_name}</td>}
      <td role="cell" className={s.date}><span className={s.cellWord}>Requested </span><time dateTime={row.requested_at}>{listDate(row.requested_at,asOf)}</time></td>
      <td role="cell" className={s.status}><span className={s.statusStack}><StatusChip status={row.status}/><AgingMarker aging={row.aging}/></span></td>
      <td role="cell" className={`${s.num} ${s.total}`}>{money(row.total)}{total&&<span className={s.sub}>{total}</span>}</td>
      <td role="cell" className={`${s.num} ${s.margin}`} data-low={floor?true:undefined}>
        {row.margin_label}<span className={s.cellWord}> margin</span>{floor&&<span className={`${s.sub} ${s.floor}`}>{floor}</span>}
      </td>
      <td role="cell" className={s.go} aria-hidden="true"><ChevronRight size={16} strokeWidth={1.8}/></td>
    </tr>
    {row.change_request&&<tr role="row" className={s.noteRow}>
      <td role="cell" colSpan={7+(selection?1:0)+(showRep?1:0)}>
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
  if(list.scope==='all'&&list.counts.all===0){
    heading='No quotes match';
    body='None of the reps you picked has a quote for this customer yet.';
    if(list.rep_filter||list.team_filter)action={href:scope.href('/rep/quotes',true),label:'Show every rep’s quotes'};
  }else if(customer&&list.other_rep&&list.counts.all===0){
    heading=`${customer.name} is ${customer.rep_name?`${customer.rep_name}’s`:'another rep’s'} customer`;
    body='Your Quotes list shows quotes for your own customers. A quote stays with the rep it was requested for unless a manager reassigns it.';
    action={href:'/rep/quotes',label:'Show all your quotes'};
  }else if(list.attention&&list.counts.all>0){
    ({heading,body}=EMPTY_ATTENTION);
    action={href:scope.href(listHref(null,null,filtersOf(list))),label:'Show every status'};
  }else if(list.status&&list.counts.all>0){
    ({heading,body}=EMPTY_STATUS[list.status]);
    action={href:scope.href(listHref(null,null,filtersOf(list))),label:'Show every status'};
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
