'use client';
import type {CustomerListItem} from '@/domain';
import type {Breakdown,MetricsRep} from '@/server/team/metrics';
import {FilterButton,FilterCheckbox,FilterField,FilterGroup,FilterInput,FilterPair,FilterSegmented,FilterSpacer,Select} from '@/components/ui';
import {PERIOD_OPTIONS,type PeriodChoice} from './TeamTabs';
import {NO_FILTER,type AnalyticsFilter} from './window';

// The Analytics filter panels: the manager's (C_AN4) picks any mix of reps and teams, a customer and the
// breakdown; a rep's (C_RAN2) picks one of their own customers and a period. "Apply filters" applies,
// "Clear all" empties the draft (U0 FilterButton). Team labels until U7 makes teams entities.

const BREAKDOWNS:readonly {value:Breakdown;label:string}[]=[{value:'org',label:'Whole organization'},{value:'rep',label:'Rep'},{value:'team',label:'Team'},{value:'customer',label:'Customer'}];
/** The panel's width in both frames. */
const WIDTH=420;
const toggle=(list:string[],value:string,on:boolean)=>on?[...list,value]:list.filter(v=>v!==value);

/** How many filters the manager applied: each rep and team picked, the customer, a breakdown other than the whole organization. */
export const managerCount=(f:AnalyticsFilter)=>f.reps.length+f.teams.length+(f.customer?1:0)+(f.breakdown!=='org'?1:0);

export function ManagerFilter({value,onApply,reps,teams,customers}:{value:AnalyticsFilter;onApply:(next:AnalyticsFilter)=>void;reps:readonly MetricsRep[];teams:readonly string[];customers:readonly CustomerListItem[]}){
  // The picked reps and teams keep the options' order.
  const ordered=(next:AnalyticsFilter):AnalyticsFilter=>({...next,reps:reps.map(r=>r.id).filter(id=>next.reps.includes(id)),teams:teams.filter(t=>next.teams.includes(t))});
  return <FilterButton title="Filter analytics" description="Pick any mix of reps and teams, then break the numbers down." width={WIDTH} actionsGap={16}
    value={value} empty={NO_FILTER} count={managerCount(value)} onApply={next=>onApply(ordered(next))}>
    {(draft,set)=><>
      <FilterGroup label="Reps" columns={3} gap="0 8px" labelMargin="6px 0 2px">
        {reps.map(r=><FilterCheckbox key={r.id} label={r.name} checked={draft.reps.includes(r.id)} onChange={on=>set({...draft,reps:toggle(draft.reps,r.id,on)})}/>)}
      </FilterGroup>
      <FilterGroup label="Teams" columns={2} gap="0 8px" labelMargin="6px 0 2px">
        {teams.map(t=><FilterCheckbox key={t} label={t} checked={draft.teams.includes(t)} onChange={on=>set({...draft,teams:toggle(draft.teams,t,on)})}/>)}
      </FilterGroup>
      <FilterSpacer height={6}/>
      <FilterField label="Customer">{id=><Select label="Customer" labelledBy={id} filled value={draft.customer??''}
        options={[{value:'',label:'Any customer'},...customers.map(c=>({value:c.id,label:c.name}))]} onChange={v=>set({...draft,customer:v||null})}/>}</FilterField>
      <FilterSegmented label="Break the numbers down by" value={draft.breakdown} options={BREAKDOWNS} onChange={breakdown=>set({...draft,breakdown})}/>
    </>}
  </FilterButton>;
}

/** A rep's filter: a customer and the period, with the custom range's two days (YYYY-MM-DD). */
export interface RepFilterValue {customer:string|null;period:PeriodChoice;start:string;end:string}
export const DEFAULT_PERIOD:PeriodChoice='30';
export const repCount=(f:RepFilterValue)=>(f.customer?1:0)+(f.period!==DEFAULT_PERIOD?1:0);

export function RepFilter({value,onApply,customers}:{value:RepFilterValue;onApply:(next:RepFilterValue)=>void;customers:readonly CustomerListItem[]}){
  return <FilterButton title="Filter analytics" description="Narrow your numbers to one customer or a period." width={WIDTH} actionsGap={16}
    value={value} empty={{...value,customer:null,period:DEFAULT_PERIOD}} count={repCount(value)} onApply={onApply}>
    {(draft,set)=><>
      <FilterSpacer height={6}/>
      <FilterField label="Customer">{id=><Select label="Customer" labelledBy={id} filled value={draft.customer??''}
        options={[{value:'',label:'Any of my customers'},...customers.map(c=>({value:c.id,label:c.name}))]} onChange={v=>set({...draft,customer:v||null})}/>}</FilterField>
      <FilterSegmented label="Period" value={draft.period} options={PERIOD_OPTIONS} onChange={period=>set({...draft,period})}/>
      {/* No frame: the custom range's two days, as C_QOB2's "Requested from" and "Requested to". */}
      {draft.period==='custom'&&<><FilterSpacer height={8}/><FilterPair>
        <FilterField label="From">{id=><FilterInput type="date" aria-labelledby={id} value={draft.start} onChange={e=>set({...draft,start:e.target.value})}/>}</FilterField>
        <FilterField label="To">{id=><FilterInput type="date" aria-labelledby={id} value={draft.end} onChange={e=>set({...draft,end:e.target.value})}/>}</FilterField>
      </FilterPair></>}
    </>}
  </FilterButton>;
}
