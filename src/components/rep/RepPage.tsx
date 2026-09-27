'use client';
import type {ReactNode} from 'react';
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

export {s as repPageStyles};
