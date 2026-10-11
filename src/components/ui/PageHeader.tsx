import type {ReactNode} from 'react';
import s from './PageHeader.module.css';

/**
 * Every page's header (plan U0; C_QOBoard): the title, then the page-local picker or search and Filter
 * (children, in order), then `right` (caution and bell) at the far end. There is no global search.
 */
export function PageHeader({title,children,right}:{title:string;children?:ReactNode;right?:ReactNode}){
  return <header className={s.header}>
    <h1 className={s.title}>{title}</h1>
    {children}
    {right&&<div className={s.right}>{right}</div>}
  </header>;
}
