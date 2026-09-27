'use client';
import type {ReactNode} from 'react';
import {useRepPortal,useRepScope} from './context';
import s from './RepPage.module.css';

/** A rep page's title block: the section name, one line of context, and optional actions on the right. */
export function RepPageHeader({title,description,actions}:{title:string;description?:ReactNode;actions?:ReactNode}){
  return <div className={s.top}>
    <div>
      <h1 className={s.title}>{title}</h1>
      {description&&<p className={s.meta}>{description}</p>}
    </div>
    {actions&&<div className={s.actions}>{actions}</div>}
  </div>;
}

/**
 * A section that a later task builds (Quotes 3.2; Customers, Orders, Items 3.8). It already
 * follows the "Viewing" picker, so the page says whose records it will show.
 */
export function SectionPlaceholder({title,heading,body,showUnreadQuotes=false}:{title:string;heading:string;body:string;
  /** Repeat the Quotes badge in the title block (the Quotes page). */
  showUnreadQuotes?:boolean}){
  const scope=useRepScope();
  const {badges}=useRepPortal();
  const unread=showUnreadQuotes?badges.quotes:0;
  return <>
    <RepPageHeader title={title} description={<>Viewing {scope.label}{unread>0&&<> · {unread} unread {unread===1?'quote':'quotes'}</>}</>}/>
    <section className={s.card} aria-labelledby="rep-placeholder-heading">
      <div className={s.empty}>
        <span className={s.pill}>Coming next</span>
        <h2 id="rep-placeholder-heading">{heading}</h2>
        <p>{body}</p>
      </div>
    </section>
  </>;
}

export {s as repPageStyles};
