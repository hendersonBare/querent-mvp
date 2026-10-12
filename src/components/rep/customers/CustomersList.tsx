'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import type {CustomerDirectoryRow} from '@/domain';
import {DataTable,FilterButton,FilterCheckbox,FilterField,FilterGroup,FilterInput,FilterPair,FilterSpacer,type DataColumn,type TablePrefs} from '@/components/ui';
import {RepPageHeader} from '../RepPage';
import {AppliedFilters,SearchBox} from '../reference/controls';
import {
  CUSTOMER_ONLY,NO_CUSTOMER_FILTERS,NOT_ON_FILE,clearCustomerGroup,customerChips,customerRepOptions,customerTermsOptions,filterCustomers,onFile,searchCustomers,
  type CustomerFilters,
} from '../reference/filters';
import {count,day,money} from '../reference/format';
import s from '../reference/Records.module.css';

// Customers (plan U5; C_CUBase manager, C_RCUBase rep, C_CU1 and C_RCU1 filter open, C_CU2 filter applied):
// every customer the signed-in rep may read (their own; the whole organization for the manager, task U1),
// read-only. Search narrows by name or account number; Filter by rep (manager only), terms, open balance
// range and the Only show rules. The count follows what is shown. Placeholder customers (spec §2) have a
// name, account number and rep only, so their other cells say so.

export const CUSTOMERS_TABLE='customers';
/** Rows shown before "Show N more" (no frame draws more than six customers). */
const PAGE_SIZE=10;

/** C_CU1 draws its field boxes white (decision 55). */
const FILLED={background:'var(--q-card)'};

const toggle=<T,>(list:readonly T[],value:T,on:boolean)=>on?[...list,value]:list.filter(v=>v!==value);

function columns(manager:boolean):DataColumn<CustomerDirectoryRow>[]{
  const all:(DataColumn<CustomerDirectoryRow>|false)[]=[
    {id:'customer',label:'Customer',track:'minmax(210px, 2fr)',alwaysShown:true,render:r=><>
      <Link className={s.name} href={`/rep/customers/${encodeURIComponent(r.id)}`}>{r.name}</Link>
      <div className={s.code}>{r.account_number}</div>
    </>},
    manager&&{id:'rep',label:'Rep',track:'1.2fr',render:r=><div className={s.semibold}>{r.rep_name??<span className={s.muted}>Unassigned</span>}</div>},
    {id:'terms',label:'Terms',track:'0.8fr',render:r=>onFile(r)&&r.terms?<div>{r.terms}</div>:<div><span className={s.muted}>{onFile(r)?'-':NOT_ON_FILE}</span></div>},
    {id:'balance',label:'Open balance',track:'1.3fr',align:'right',render:r=>onFile(r)?<>
      <div className={s.balance}>{money(r.open_balance??0)}</div>
      {r.credit_limit!==null&&<div className={s.balanceOf}>{`of ${money(r.credit_limit)}`}</div>}
    </>:<div><span className={s.muted}>-</span></div>},
    {id:'last_order',label:'Last order',track:'1.1fr',render:r=>r.last_order_date?<div>{day(r.last_order_date)}</div>:<div><span className={s.muted}>No orders yet</span></div>},
    {id:'orders',label:'Orders',track:'0.7fr',align:'right',render:r=><div className={s.num}>{r.order_count}</div>},
    {id:'quotes',label:'Quotes',track:'0.7fr',align:'right',render:r=><div className={s.num}>{r.quote_count}</div>},
  ];
  return all.filter((c):c is DataColumn<CustomerDirectoryRow>=>!!c);
}

export function CustomersList({rows,manager,initialPrefs=null}:{rows:CustomerDirectoryRow[];
  /** The manager sees the Rep column and the Rep filter (C_CUBase); a rep does not (C_RCUBase). */
  manager:boolean;initialPrefs?:TablePrefs|null}){
  const [query,setQuery]=useState('');
  const [filters,setFilters]=useState<CustomerFilters>(NO_CUSTOMER_FILTERS);
  const reps=useMemo(()=>customerRepOptions(rows),[rows]);
  const terms=useMemo(()=>customerTermsOptions(rows),[rows]);
  const highest=useMemo(()=>Math.max(0,...rows.map(r=>r.open_balance??0)),[rows]);
  const applied=manager?filters:{...filters,reps:[]};
  const chips=customerChips(applied,reps);
  const shown=filterCustomers(searchCustomers(rows,query),applied);
  const cols=useMemo(()=>columns(manager),[manager]);
  return <>
    <RepPageHeader title="Customers">
      <SearchBox label="Search customers" value={query} onChange={setQuery} width={320}/>
      <FilterButton<CustomerFilters> title="Filter customers" width={400} value={applied} empty={NO_CUSTOMER_FILTERS} count={chips.length} onApply={setFilters}
        description={manager?'Pick one rep or several to see their customers together.':'Narrow your customers by terms, balance or open quotes.'}>
        {(draft,set)=><>
          {manager&&<FilterGroup label="Rep" labelMargin="6px 0 2px">
            {reps.map(r=><FilterCheckbox key={r.id} label={r.name} count={r.count} checked={draft.reps.includes(r.id)} onChange={on=>set({...draft,reps:toggle(draft.reps,r.id,on)})}/>)}
          </FilterGroup>}
          <FilterGroup label="Terms" columns={3} gap="0 8px" labelMargin="6px 0 2px">
            {terms.map(t=><FilterCheckbox key={t} label={t} checked={draft.terms.includes(t)} onChange={on=>set({...draft,terms:toggle(draft.terms,t,on)})}/>)}
          </FilterGroup>
          <FilterSpacer height={6}/>
          <FilterPair>
            <FilterField label="Open balance from">{id=><FilterInput style={FILLED} type="text" inputMode="decimal" aria-label="Open balance from" aria-describedby={id}
              placeholder={money(0)} value={draft.balanceFrom} onChange={e=>set({...draft,balanceFrom:e.target.value})}/>}</FilterField>
            <FilterField label="Open balance to">{id=><FilterInput style={FILLED} type="text" inputMode="decimal" aria-label="Open balance to" aria-describedby={id}
              placeholder={money(highest)} value={draft.balanceTo} onChange={e=>set({...draft,balanceTo:e.target.value})}/>}</FilterField>
          </FilterPair>
          <FilterGroup label="Only show" labelMargin="6px 0 2px">
            {CUSTOMER_ONLY.map(o=><FilterCheckbox key={o.value} label={o.label} checked={draft.only.includes(o.value)} onChange={on=>set({...draft,only:toggle(draft.only,o.value,on)})}/>)}
          </FilterGroup>
        </>}
      </FilterButton>
      <span className={s.count}>{count(shown.length,'customer')}</span>
    </RepPageHeader>
    <div className="ui-root">
      <AppliedFilters chips={chips} onRemove={group=>setFilters(clearCustomerGroup(filters,group))} onClear={()=>setFilters(NO_CUSTOMER_FILTERS)}/>
      <DataTable<CustomerDirectoryRow> className={s.table} tableId={CUSTOMERS_TABLE} label="Customers" columns={cols} rows={shown} rowKey={r=>r.id}
        layout="split" splitGap={14} minWidth={900} pageSize={PAGE_SIZE} initialPrefs={initialPrefs}
        moreLabel={n=>`Show ${n} more ${n===1?'customer':'customers'}`} lessLabel="Show fewer customers"/>
      {!shown.length&&<p className={s.empty}>No customers match.</p>}
    </div>
  </>;
}
