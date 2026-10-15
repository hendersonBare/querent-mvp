'use client';
import {useState,type ReactNode} from 'react';
import type {API,Principal} from '@/lib/contracts';
import {cx} from '@/components/ui/cx';
import {QuotePreview} from '../quote-preview/QuotePreview';
import {AccountChip} from './AccountChip';
import {Bell} from './Bell';
import {SiteIcon} from './icons';
import {OrdersSheet} from './OrdersSheet';
import {RepSheet} from './RepSheet';
import s from './site.module.css';

/**
 * The logged-in customer site (plan U10; C_CVL1 to C_CVL5): the strip with the bell and the account
 * chip, then the box with Orders and My rep above it, each opening its side sheet. The bell's quote
 * notifications open the quote preview (QuotePreview, decision 41). `actions` go before Orders (New
 * conversation, once a conversation has turns; no frame). The box itself is `children` (the chat).
 */
export function CustomerSite({api,user,signOut,actions,now,pollMs,children}:{api:API;user:Principal;signOut:()=>void;actions?:ReactNode;now?:string;pollMs?:number;children:ReactNode}){
  const [sheet,setSheet]=useState<'orders'|'rep'|null>(null);
  const toggle=(which:'orders'|'rep')=>setSheet(current=>current===which?null:which);
  return <div className={s.page}>
    <div className={s.bar}>
      <span className={s.spacer}/>
      <Bell api={api} now={now} pollMs={pollMs}/>
      <AccountChip name={user.name} signOut={signOut}/>
    </div>
    <main className={s.main}>
      <div className={s.actions}>
        {actions}
        <button type="button" className={cx(s.action,sheet==='orders'&&s.actionOpen)} aria-expanded={sheet==='orders'} onClick={()=>toggle('orders')}><SiteIcon name="orders" size={18}/>Orders</button>
        <button type="button" className={cx(s.action,sheet==='rep'&&s.actionOpen)} aria-expanded={sheet==='rep'} onClick={()=>toggle('rep')}><SiteIcon name="rep" size={18}/>My rep</button>
      </div>
      {children}
    </main>
    {sheet==='orders'&&<OrdersSheet api={api} onClose={()=>setSheet(null)}/>}
    {sheet==='rep'&&<RepSheet api={api} onClose={()=>setSheet(null)}/>}
    <QuotePreview api={api} now={now}/>
  </div>;
}

/** The site's action buttons' look, for New conversation (no frame: the Orders button's tokens). */
export const actionClass=s.action;
