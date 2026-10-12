import type {ReactNode} from 'react';
import s from './PageHeader.module.css';
import {cx} from './cx';

/**
 * Every page's header (plan U0; C_QOBoard): the title, then the page-local picker or search and Filter
 * (children, in order), then `right` (caution and bell) at the far end. There is no global search.
 * `subtitle` is the line some frames draw under the title (C_ANBase); the title and it then share one block.
 */
export function PageHeader({title,subtitle,children,right,className}:{title:string;subtitle?:ReactNode;children?:ReactNode;right?:ReactNode;className?:string}){
  const heading=<h1 className={s.title}>{title}</h1>;
  return <header className={cx(s.header,className)} data-ui="page-header">
    {subtitle?<div>{heading}<div className={s.subtitle}>{subtitle}</div></div>:heading}
    {children}
    {right&&<div className={s.right}>{right}</div>}
  </header>;
}
