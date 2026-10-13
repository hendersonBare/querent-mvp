'use client';
import {useCallback,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {QuoteStatus} from '@/domain';
import {usePoll} from '@/lib/use-poll';
import type {RepQuoteList,RepQuoteRow} from '@/server/rep/quotes';
import {CustomerPicker,FilterButton,FilterCheckbox,FilterField,FilterGroup,FilterPair,FilterSpacer,Select,saveTablePrefs,type TablePrefs} from '@/components/ui';
import {moveItem,resolveColumns} from '@/components/ui/table-prefs';
import {useRepPortal} from '../context';
import {RepPageHeader} from '../RepPage';
import {BADGE_POLL_MS} from '../RepShell';
import {NoteDialog} from './NoteDialog';
import {QuotePreview} from './QuotePreview';
import {QuotesBoard} from './QuotesBoard';
import {QuotesTable} from './QuotesTable';
import {ALL_STATUSES,BOARD_ID,NO_FILTERS,ONLY_LABELS,ONLY_SHOW,filterCount,filtersFromQuery,fromPanel,keptQuery,quotesHref,toPanel,type QuoteFilters,type QuotesView} from './filters';
import {REFRESH_PROBLEM,REP_STATUS,STATUS_FILTERS,dayChoices,dayLabel} from './labels';
import s from './Quotes.module.css';

export {LANE_PAGE} from './QuotesBoard';

// The Quotes page (plan U3; frames C_QOBoard, C_QOTable and their opened states; C_RQBoard, C_RQTable
// for a rep). One toolbar: the customer picker (C_QOB1), Filter (C_QOB2) and Board/Table. The board
// (./QuotesBoard) and the table (./QuotesTable) show the same quotes; a card or row opens the quote
// preview (./QuotePreview, C_QOB5) and View note opens the customer's note (./NoteDialog, C_QOB6).
//
// The page's URL holds the view and the filters (./filters): the server renders the list for it and the
// list re-reads GET /api/rep/quotes with the same query every few seconds. Scope is role based on the
// server (task U1): a rep sees their own quotes and customers, with no Rep column or Rep filter; the
// manager sees every rep's. Needs attention is the header's caution dropdown (plan U2) plus Only show
// Overdue and Aging here. There is no status strip, no Needs attention view and no bulk reassign
// (decision 45: it moves to Teams and Reps, plan U7).

/** How often the list is re-read, in step with the header badges. */
export const LIST_POLL_MS=BADGE_POLL_MS;

async function loadQuotes(query:string):Promise<RepQuoteList>{
  const response=await fetch(query?`/api/rep/quotes?${query}`:'/api/rep/quotes',{cache:'no-store'});
  if(response.status===401||response.status===403){window.location.assign('/');throw new Error('Sign in to continue.');}
  if(!response.ok)throw new Error('Unable to refresh quotes.');
  return response.json();
}

export interface QuotesListProps {
  /** The list the server rendered for `query`. */
  initial:RepQuoteList;
  /** The page's filter query (./filters canonicalQuery), which the list polls. */
  query:string;
  view:QuotesView;
  /** The signed-in user's saved column order and lane order. */
  prefs:{table:TablePrefs|null;board:TablePrefs|null};
}

export function QuotesList({initial,query,view,prefs}:QuotesListProps){
  const router=useRouter();
  const {rep}=useRepPortal();
  const load=useCallback(()=>loadQuotes(query),[query]);
  const {data,error}=usePoll(load,LIST_POLL_MS);
  const list=data??initial;
  const manager=!!rep.manager||list.scope==='all';
  const filters=filtersFromQuery(query);
  const kept=keptQuery(query);
  const go=(next:QuoteFilters,nextView:QuotesView=view,keep=kept)=>router.push(quotesHref(next,nextView,keep),{scroll:false});
  const [lanes,setLanes]=useState<QuoteStatus[]>(()=>resolveColumns(STATUS_FILTERS.map(id=>({id})),prefs.board).order as QuoteStatus[]);
  const [preview,setPreview]=useState<RepQuoteRow|null>(null);
  const [note,setNote]=useState<RepQuoteRow|null>(null);
  const shownLanes=filters.statuses.length?lanes.filter(l=>filters.statuses.includes(l)):lanes;
  function moveLane(from:number,to:number){
    const next=moveItem(lanes,lanes.indexOf(shownLanes[from]),lanes.indexOf(shownLanes[to]));
    setLanes(next);
    void saveTablePrefs(BOARD_ID,{column_order:next,hidden_columns:[]});
  }
  const actions={onPreview:setPreview,onNote:setNote};
  return <>
    <RepPageHeader title="Quotes">
      <CustomerPicker customers={list.customers} value={filters.customer} onChange={customer=>go({...filters,customer})}
        allLabel={manager?undefined:'All my customers'} summary={manager?undefined:mineSummary}/>
      <QuoteFilterButton filters={filters} list={list} manager={manager} onApply={next=>go(next,view,'')}/>
      <div role="group" aria-label="View" className={s.views}>
        {(['board','table'] as const).map(v=><button key={v} type="button" aria-pressed={view===v} className={s.view} onClick={()=>go(filters,v)}>{v==='board'?'Board':'Table'}</button>)}
      </div>
    </RepPageHeader>
    <div className="ui-root">
      {error&&<p className={s.problem} role="status">{REFRESH_PROBLEM}</p>}
      {view==='board'
        ?<QuotesBoard rows={list.rows} lanes={shownLanes} asOf={list.as_of} onMove={moveLane} {...actions}/>
        :<QuotesTable rows={list.rows} manager={manager} asOf={list.as_of} prefs={prefs.table} {...actions}/>}
    </div>
    {/* Only the quote's own rep replies; the manager reads other reps' quotes read-only (decision 22). */}
    <QuotePreview row={preview} asOf={list.as_of} canReply={preview?.rep_id===rep.id} onClose={()=>setPreview(null)} onReply={row=>{setPreview(null);setNote(row);}}/>
    <NoteDialog row={note} canReply={note?.rep_id===rep.id} onClose={()=>setNote(null)}/>
  </>;
}

/**
 * A rep's picker line (C_RQB1 "Your 3 customers. Type to search."), when every row fits in the list's
 * five; a longer list keeps the default "Showing 5 of N" line (no frame for a rep with more).
 */
function mineSummary(count:number){
  return count+1<=5?`Your ${count} ${count===1?'customer':'customers'}. Type to search.`:null;
}

/**
 * Filter (C_QOB2, C_QOT1; C_RQB2 for a rep): status, Rep (the manager only), Customer, Requested from and
 * to, Only show. The panel edits a draft; Apply filters puts it in the URL (dropping a drill-down's own
 * params), Clear all empties it.
 */
function QuoteFilterButton({filters,list,manager,onApply}:{filters:QuoteFilters;list:RepQuoteList;manager:boolean;onApply:(f:QuoteFilters)=>void}){
  const reps=list.manager?.reps??[];
  return <FilterButton<QuoteFilters> title="Filter quotes" value={toPanel(filters)} empty={NO_FILTERS} count={filterCount(filters)} onApply={draft=>onApply(fromPanel(draft))}>
    {(draft,set)=><>
      <FilterGroup label="Status" columns={2}>
        {ALL_STATUSES.map(status=><FilterCheckbox key={status} label={REP_STATUS[status].label} checked={draft.statuses.includes(status)}
          onChange={on=>set({...draft,statuses:on?[...draft.statuses,status]:draft.statuses.filter(x=>x!==status)})}/>)}
      </FilterGroup>
      <FilterSpacer height={8}/>
      {manager&&<FilterField label="Rep">{id=><Select label="Rep" labelledBy={id} value={draft.rep??''} onChange={rep=>set({...draft,rep:rep||null})}
        options={[{value:'',label:'All reps'},...reps.map(r=>({value:r.id,label:r.name}))]}/>}</FilterField>}
      <FilterField label="Customer">{id=><Select label="Customer" labelledBy={id} value={draft.customer??''} onChange={customer=>set({...draft,customer:customer||null})}
        options={[{value:'',label:manager?'Any customer':'Any of my customers'},...list.customers.map(c=>({value:c.id,label:c.name}))]}/>}</FilterField>
      <FilterPair>
        <DayField label="Requested from" value={draft.requestedFrom} asOf={list.as_of} onChange={requestedFrom=>set({...draft,requestedFrom})}/>
        <DayField label="Requested to" value={draft.requestedTo} asOf={list.as_of} onChange={requestedTo=>set({...draft,requestedTo})}/>
      </FilterPair>
      <FilterGroup label="Only show" labelMargin="2px 0">
        {ONLY_SHOW.map(o=><FilterCheckbox key={o} label={ONLY_LABELS[o]} checked={draft.only.includes(o)}
          onChange={on=>set({...draft,only:on?[...draft.only,o]:draft.only.filter(x=>x!==o)})}/>)}
      </FilterGroup>
    </>}
  </FilterButton>;
}

/**
 * Requested from or to (C_QOB2, C_QOT1, C_RQB2): the frame's plain field box with the day as the list
 * prints it ("Sep 1"), and nothing in it for any day. It opens a list of days, Any day first (no frame:
 * the frame draws the closed field only; docs/plans/status.md "No frame").
 */
function DayField({label,value,asOf,onChange}:{label:string;value:string|null;asOf:string;onChange:(day:string|null)=>void}){
  return <FilterField label={label}>{id=><Select label={label} labelledBy={id} value={value??''} boxText={value?dayLabel(value,asOf):''}
    onChange={day=>onChange(day||null)} options={[{value:'',label:'Any day'},...dayChoices(asOf,[value]).map(day=>({value:day,label:dayLabel(day,asOf)}))]}/>}</FilterField>;
}
