'use client';
import {useId,useState} from 'react';
import {labels,type AccessRule,type Category} from '@/lib/contracts';
import type {AccessSettings} from '@/server/rep/settings';
import {repPageStyles as page} from '../RepPage';
import {saveSetting} from './api';
import {Switch} from './Switch';
import s from './Settings.module.css';

// Settings > Customer access (spec §2, §6.3): what Querent answers in chat, per information
// category, for one customer (or every customer). The customer is the page's own ?customer=, picked
// here (task U1: no header picker any more). The chat tools check these on every question,
// server-side; a refused question points the customer to their rep.

/** What each category covers in chat (the tools behind it, src/server/chat/tools.ts TOOL_CATEGORY). */
export const CATEGORY_HELP:Record<Category,string>={
  items_stock:'Finding items, stock by branch, and asking for a quote in chat',
  pricing:'Their prices for items',
  orders_quotes:'Order history, order status and quotes',
  account:'Terms, credit limit, balances and who their rep is',
};

function stateText(rule:AccessRule){
  if(rule.enabled===null)return 'On for some customers';
  if(rule.enabled)return 'Querent answers';
  return rule.mixed_rep?'Off: chat refers them to their rep':`Off: chat refers them to ${rule.rep_name}`;
}

export function CustomerAccess({access,scopeLabel,customers,onPick,onChange}:{access:AccessSettings;
  /** "Wasatch Mechanical Contractors" or "All customers". */
  scopeLabel:string;
  /** The customers the rep may pick: their own, or every customer for the manager. */
  customers:{id:string;name:string}[];
  /** Picks a customer (null for every customer); the page reloads Customer access for it. */
  onPick:(customerId:string|null)=>void;
  onChange:(access:AccessSettings)=>void}){
  const [pending,setPending]=useState<Category|null>(null),[error,setError]=useState('');
  const everyone=access.customer_id===null;
  const pickId=useId();

  async function toggle(rule:AccessRule){
    setPending(rule.category);setError('');
    try{onChange(await saveSetting<AccessSettings>('access',{customer_id:access.customer_id,category:rule.category,enabled:rule.enabled!==true}));}
    catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setPending(null);}
  }

  return <section className={`${page.card} ${s.card}`} aria-labelledby="settings-access">
    <div className={s.head}>
      <h2 id="settings-access">Customer access</h2>
      <p>{everyone
        ?'What Querent answers in chat for every customer. A change here applies to all of them; pick a customer to set theirs alone.'
        :`What Querent answers in chat for ${scopeLabel}. Anything turned off, chat declines and gives their rep’s phone and email.`}</p>
    </div>
    <div className={s.accessPick}>
      <label htmlFor={pickId}>Customer</label>
      <select id={pickId} className={s.select} value={access.customer_id??''} onChange={event=>onPick(event.target.value||null)}>
        <option value="">All customers</option>
        {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
    {error&&<p className={s.error} role="alert">{error}</p>}
    <ul className={s.rows}>
      {access.rules.map(rule=>{
        const describedBy=`access-${rule.category}-state`;
        return <li key={rule.category} className={s.row}>
          <div className={s.rowText}>
            <span className={s.name}>{labels[rule.category]}</span>
            <span className={s.sub}>{CATEGORY_HELP[rule.category]}</span>
          </div>
          <span className={s.state} id={describedBy} data-state={rule.enabled===null?'mixed':rule.enabled?'on':'off'}>{stateText(rule)}</span>
          <Switch checked={rule.enabled} label={labels[rule.category]} describedBy={describedBy} disabled={pending!==null} onToggle={()=>void toggle(rule)}/>
        </li>;
      })}
    </ul>
  </section>;
}
