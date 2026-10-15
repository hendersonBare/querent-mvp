import type {CSSProperties,ReactNode} from 'react';
import Link from 'next/link';
import type {OrderStatus,QuoteStatus} from '@/domain';
import ph from '@/components/ui/PageHeader.module.css';
import {cx} from '@/components/ui/cx';
import {HeaderAlerts} from '../HeaderAlerts';
import {RepPageHeader} from '../RepPage';
import {REP_STATUS} from '../quotes/labels';
import {ORDER_STATUS} from './format';
import s from './Records.module.css';

// Building blocks of the Customers, Orders and Stock pages (plan U5). No hooks, so the detail pages stay
// Server Components. Every look comes from the frames (./Records.module.css). Links never carry the
// page's own ?customer= to another page (task U1), except "View all" on a customer page.

/**
 * A detail page's header (C_CU3, C_OR2, C_ST2): the record's name (in Geist Mono for an order number),
 * an optional status chip beside it, the facts line under it, and the shell's caution and bell on the
 * right, in the page header's layout (src/components/ui/PageHeader).
 */
export function DetailHeader({title,mono=false,chip,subtitle}:{title:string;mono?:boolean;chip?:ReactNode;subtitle:ReactNode}){
  const heading=<h1 className={cx(ph.title,mono&&s.monoTitle)}>{title}</h1>;
  return <header className={cx('ui-root',ph.header)} data-ui="page-header">
    <div>
      {chip?<div className={s.titleRow}>{heading}{chip}</div>:heading}
      <div className={s.subtitle}>{subtitle}</div>
    </div>
    <div className={ph.right}><HeaderAlerts/></div>
  </header>;
}

/** A white card with the charcoal title bar (C_CU3, C_OR2, C_ST2): title, optional meta, optional link at the right. */
export function Card({id,title,meta,action,children}:{id:string;title:string;meta?:string;action?:{href:string;label:string};children:ReactNode}){
  return <section className={s.card} aria-labelledby={id}>
    <div className={s.cardHead}>
      <h2 id={id} className={s.cardTitle}>{title}</h2>
      {meta&&<span className={s.cardMeta}>{meta}</span>}
      {action&&<Link className={s.cardAction} href={action.href} prefetch={false}>{action.label}</Link>}
    </div>
    {children}
  </section>;
}

export interface DetailColumn {label:string;align?:'right'}
/**
 * A table inside a card (C_CU3 Recent quotes, C_OR2 Items, C_ST2 Stock by branch and Recent orders): the
 * gray header with a "::" on each label, then the rows. Detail tables have no filter and no columns picker.
 */
export function DetailTable({label,tracks,columns,children}:{label:string;tracks:string;columns:readonly DetailColumn[];children:ReactNode}){
  return <div role="table" aria-label={label}>
    <div role="row" className={s.detailHead} style={{gridTemplateColumns:tracks}}>
      {columns.map(c=><div key={c.label} role="columnheader" className={c.align==='right'?s.right:undefined}>{`:: ${c.label}`}</div>)}
    </div>
    {children}
  </div>;
}
export function DetailRow({tracks,className,children}:{tracks:string;className?:string;children:ReactNode}){
  return <div role="row" className={cx(s.detailRow,className)} style={{gridTemplateColumns:tracks}}>{children}</div>;
}
export function Cell({align,className,style,children}:{align?:'right';className?:string;style?:CSSProperties;children?:ReactNode}){
  return <div role="cell" className={cx(align==='right'&&s.right,className)||undefined} style={style}>{children}</div>;
}

/** C_CU3 "No orders yet": a heading and one line under it. */
export function EmptyBlock({title,children}:{title:string;children?:ReactNode}){
  return <div className={s.emptyBlock}><div className={s.emptyTitle}>{title}</div>{children&&<div className={s.emptyBody}>{children}</div>}</div>;
}

/** Label and value rows (C_OR2 Order details, C_ST2 Item details): the value bold and dark, or a green link. */
export function Fact({label,href,mono=false,children}:{label:string;href?:string;mono?:boolean;children:ReactNode}){
  return <div className={s.fact}>
    <dt>{label}</dt>
    {href?<dd className={s.valueLink}><Link href={href} prefetch={false}>{children}</Link></dd>
      :<dd className={s.value}>{mono?<span className={s.mono}>{children}</span>:children}</dd>}
  </div>;
}

/** A quote's status as plain text (C_CU3 "Draft ready"), in the Quotes list's words. */
export function QuoteStatusText({status}:{status:QuoteStatus}){
  return <div className={s.semibold}>{REP_STATUS[status].label}</div>;
}

/** An order's status in a table (C_ORBase): Shipped in green, Closed muted. */
export function OrderStatusText({status}:{status:OrderStatus}){
  return <span className={s[status]}>{ORDER_STATUS[status]}</span>;
}
/** An order's status beside its number (C_OR2 "SHIPPED"). */
export function OrderStatusChip({status}:{status:OrderStatus}){
  return <span className={cx(s.chipStatus,status==='closed'&&s.chipClosed,status==='open'&&s.chipOpen)}>{ORDER_STATUS[status]}</span>;
}

/** A detail page's not-found.tsx (no frame: decision 52, one plain line and the way back). */
export function RecordNotFound({title,heading,body,back}:{title:string;heading:string;body:string;back:{href:string;label:string}}){
  return <>
    <RepPageHeader title={title}/>
    <section className={cx('ui-root',s.notFound)} aria-labelledby="record-not-found">
      <h2 id="record-not-found">{heading}</h2>
      <p>{body}</p>
      <Link href={back.href}>{back.label}</Link>
    </section>
  </>;
}

// Server Components import CSS modules directly: a value re-exported from a 'use client' module is only a client reference there.
export {s as recordStyles};
