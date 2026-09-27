import type {ReactNode} from 'react';
import Link from 'next/link';
import type {OrderStatus,QuoteStatus} from '@/domain';
import page from '../RepPage.module.css';
import {scopedHref} from '../scope';
import {ORDER_STATUS,QUOTE_STATUS} from './format';
import s from './Reference.module.css';

// Building blocks for the rep's Customers, Orders and Items pages (task 3.8). No hooks: the pages
// are Server Components, so they read the "Viewing" picker from searchParams and pass it down.

/** The "Viewing" picker as a page read it: the picked customer's id (null for All customers) and its label. */
export interface Viewing {customerId:string|null;label:string}

/** A portal link that keeps the picked customer, like useRepScope().href. */
export const hrefFor=(viewing:Pick<Viewing,'customerId'>,path:string)=>scopedHref(path,viewing.customerId);

/** "Customers / WAS-1142": the section link, then where you are. */
export function Crumbs({section,href,current}:{section:string;href:string;current:string}){
  return <nav className={s.crumbs} aria-label="Breadcrumb">
    <Link href={href}>{section}</Link><span aria-hidden="true">/</span><span aria-current="page">{current}</span>
  </nav>;
}

/**
 * A detail page's title block (mockup .qtop/.qtitle): the record's name with an optional status
 * chip beside it, and one line of facts. List pages use RepPageHeader.
 */
export function DetailHeader({title,chip,meta}:{title:string;chip?:ReactNode;meta?:ReactNode}){
  return <div className={page.top}>
    <div>
      <div className={s.titleRow}><h1 className={page.title}>{title}</h1>{chip}</div>
      {meta&&<p className={page.meta}>{meta}</p>}
    </div>
  </div>;
}

/** A card with an uppercase heading (mockup .itoolbar h3), optional meta and a link on the right. */
export function Panel({id,title,meta,action,children,flush=false}:{id:string;title:string;meta?:ReactNode;action?:{href:string;label:string};children:ReactNode;
  /** Tables run edge to edge; text gets padding. */
  flush?:boolean}){
  return <section className={s.panel} aria-labelledby={id}>
    <header className={s.panelHead}>
      <h2 id={id}>{title}</h2>
      {meta!==undefined&&<span className={s.panelMeta}>{meta}</span>}
      {action&&<Link className={s.panelAction} href={action.href}>{action.label}</Link>}
    </header>
    {flush?children:<div className={s.panelBody}>{children}</div>}
  </section>;
}

/** What a list says when it has nothing to show, and why. */
export function Empty({heading,children}:{heading:string;children?:ReactNode}){
  return <div className={s.empty}><h3>{heading}</h3>{children&&<p>{children}</p>}</div>;
}

/**
 * A detail page's not-found.tsx. Its back link drops the picked customer: not-found UI can't read
 * searchParams, and All customers always holds the record list.
 */
export function RecordNotFound({title,heading,body,back}:{title:string;heading:string;body:string;back:{href:string;label:string}}){
  return <>
    <div className={page.top}><h1 className={page.title}>{title}</h1></div>
    <section className={page.card} aria-labelledby="record-not-found">
      <div className={page.empty}>
        <h2 id="record-not-found">{heading}</h2>
        <p>{body}</p>
        <Link href={back.href}>{back.label}</Link>
      </div>
    </section>
  </>;
}

export function QuoteStatusChip({status}:{status:QuoteStatus}){
  const {label,tone}=QUOTE_STATUS[status];
  return <span className={s.chip} data-tone={tone}>{label}</span>;
}

export function OrderStatusChip({status}:{status:OrderStatus}){
  const {label,tone}=ORDER_STATUS[status];
  return <span className={s.chip} data-tone={tone}>{label}</span>;
}

/** Available stock at one branch, red at zero, with what's on order. */
export function Stock({available,onOrder=0}:{available:number;onOrder?:number}){
  return <span className={s.stock} data-out={available<=0||undefined}>{available}{onOrder>0&&<span className={s.onOrder}>+{onOrder} on order</span>}</span>;
}

// Server Components import CSS modules directly: a value re-exported from a 'use client' module (RepPage's repPageStyles) is only a client reference there.
export {s as referenceStyles,page as pageStyles};
