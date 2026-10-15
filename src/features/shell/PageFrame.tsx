import type {ReactNode} from 'react';
import {PageHeader} from '@/components/ui/PageHeader';
import s from './PageFrame.module.css';

/**
 * A page inside the shell: the page header (its title, an optional line under it and optional
 * actions on the right), then the page's body.
 *
 *   <PageFrame title="Quotes" actions={<button …/>}>…</PageFrame>
 */
export function PageFrame({title,description,actions,children}:{title:string;description?:ReactNode;actions?:ReactNode;children?:ReactNode}){
  return <div className={`ui-root ${s.frame}`}>
    <PageHeader className={s.header} title={title} subtitle={description} right={actions}/>
    <div className={s.body}>{children}</div>
  </div>;
}
