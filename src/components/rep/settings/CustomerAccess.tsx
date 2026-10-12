'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {FilterButton,FilterSegmented,Toggle} from '@/components/ui';
import type {AccessRule,Category} from '@/lib/contracts';
import type {AccessSettings,AccessTable} from '@/server/rep/settings';
import {SearchBox} from '../reference/controls';
import {loadAccess,saveSetting} from './api';
import {ACCESS_CHOICES,ACCESS_TYPES,NO_ACCESS_FILTER,accessQuery,accessState,filterCount,matchCount,type AccessFilterValue} from './format';
import {Card,GridHead,Problem,SettingsFrame} from './parts';
import s from './Settings.module.css';

// Settings > Customer access (spec §2, §6.3; plan U8; C_S1, C_S1a, C_S1b), the manager's: what Querent
// answers in chat, per data type. With no search and no filter, one switch per type sets it for every
// customer (C_S1). A search (name or account number) or the Filter (each type Any, Querent answers or Not
// shared, C_S1a) lists the matching customers with one switch per type, so access is set per customer
// (C_S1b), with "2 of 6 customers" beside the Filter. The chat tools check these on every question.
// No frame: "On for some customers" for a type that differs between customers, and one plain line when
// no customer matches (decision 52).

/** How long the search waits after the last key before it asks the server. */
export const SEARCH_DEBOUNCE_MS=200;

export function CustomerAccess({initialRules,initialTable,tabs}:{initialRules:AccessRule[];initialTable:AccessTable|null;tabs:ReactNode}){
  const [rules,setRules]=useState(initialRules);
  const [q,setQ]=useState(initialTable?.q??'');
  const [filter,setFilter]=useState<AccessFilterValue>(NO_ACCESS_FILTER);
  const [result,setResult]=useState<AccessTable|null>(initialTable);
  const [error,setError]=useState('');
  const picked=filterCount(filter);
  const query=accessQuery(q,filter);
  const listing=query!=='';
  // The table opened from a link (?customer=) is already loaded: skip its first fetch.
  const loaded=useRef(initialTable?accessQuery(initialTable.q,NO_ACCESS_FILTER):'');

  useEffect(()=>{
    if(!listing||query===loaded.current)return;
    let cancelled=false;
    const timer=setTimeout(()=>{
      loadAccess(query).then(table=>{if(!cancelled){loaded.current=query;setResult(table);setError('');}},e=>{if(!cancelled)setError(e instanceof Error?e.message:'Unable to load customers. Try again.');});
    },q.trim()&&picked===0?SEARCH_DEBOUNCE_MS:0);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[query,listing,q,picked]);
  // Back to no search and no filter: the next search loads afresh.
  useEffect(()=>{if(!listing)loaded.current='';},[listing]);

  const controls=<>
    <SearchBox label="Search customers" value={q} onChange={setQ} width={300}/>
    <FilterButton<AccessFilterValue> title="Filter customers" value={filter} empty={NO_ACCESS_FILTER} count={picked} onApply={setFilter}
      width={420} titleGap={0} actionsGap={18} panelClassName={s.filterPanel} countClassName={s.filterCount}>
      {(draft,set)=>ACCESS_TYPES.map(t=><FilterSegmented key={t.category} label={t.label} value={draft[t.category]} options={ACCESS_CHOICES}
        padding="7px 4px" labelMargin="10px 0 4px" onChange={value=>set({...draft,[t.category]:value})}/>)}
    </FilterButton>
    {listing&&result&&<span className={s.count}>{matchCount(result.customers.length,result.total)}</span>}
  </>;

  return <SettingsFrame tabs={tabs} controls={controls}>
    {listing
      ?<AccessByCustomer table={result} error={error} onChange={(id,category,on)=>setResult(r=>r&&{...r,customers:r.customers.map(c=>c.id===id?{...c,access:{...c.access,[category]:on}}:c)})} onAll={setRules}/>
      :<EveryCustomer rules={rules} onRules={setRules}/>}
  </SettingsFrame>;
}

/** C_S1: one switch per data type over every customer. */
function EveryCustomer({rules,onRules}:{rules:AccessRule[];onRules:(rules:AccessRule[])=>void}){
  const [pending,setPending]=useState<Category|null>(null),[error,setError]=useState('');
  async function toggle(rule:AccessRule){
    setPending(rule.category);setError('');
    try{onRules((await saveSetting<AccessSettings>('access',{customer_id:null,category:rule.category,enabled:rule.enabled!==true})).all);}
    catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setPending(null);}
  }
  return <Card title="Customer access">
    <Problem>{error}</Problem>
    {ACCESS_TYPES.map(t=>{
      const rule=rules.find(r=>r.category===t.category);
      if(!rule)return null;
      const stateId=`access-${t.category}-state`;
      return <div key={t.category} className={s.accessRow}>
        <div><div className={s.strong}>{t.label}</div></div>
        <div className={s.control}>
          <span className={s.state} id={stateId}>{accessState(rule.enabled)}</span>
          <Toggle describedBy={stateId} checked={rule.enabled===true} label={t.label} disabled={pending!==null} onChange={()=>void toggle(rule)}/>
        </div>
      </div>;
    })}
  </Card>;
}

/** C_S1b: the matching customers, one switch per data type each. */
function AccessByCustomer({table,error,onChange,onAll}:{table:AccessTable|null;error:string;onChange:(id:string,category:Category,on:boolean)=>void;onAll:(rules:AccessRule[])=>void}){
  const [pending,setPending]=useState<string|null>(null),[problem,setProblem]=useState('');
  async function toggle(id:string,category:Category,on:boolean){
    setPending(`${id}:${category}`);setProblem('');
    try{
      const saved=await saveSetting<AccessSettings>('access',{customer_id:id,category,enabled:on});
      onChange(id,category,saved.rules.find(r=>r.category===category)?.enabled===true);
      onAll(saved.all);
    }catch(e){setProblem(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setPending(null);}
  }
  return <section className={s.card} role="table" aria-label="Customer access by customer">
    <GridHead className={s.accessGrid+' '+s.accessHead} labels={['Customer',...ACCESS_TYPES.map(t=>t.label)]}/>
    <Problem>{error||problem}</Problem>
    {table&&!table.customers.length&&<p className={s.plain}>No customers match.</p>}
    {table?.customers.map(c=><div key={c.id} role="row" className={`${s.gridRow} ${s.accessGrid}`}>
      <div role="rowheader"><div className={s.strong}>{c.name}</div><div className={s.code}>{c.account_number}</div></div>
      {ACCESS_TYPES.map(t=><div key={t.category} role="cell">
        <Toggle checked={c.access[t.category]} label={`${t.label} for ${c.name}`} disabled={pending!==null} onChange={on=>void toggle(c.id,t.category,on)}/>
      </div>)}
    </div>)}
  </section>;
}
