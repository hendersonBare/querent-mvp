'use client';
import {useId,type ReactNode} from 'react';
import p from './Panels.module.css';

/**
 * One section of Quote details (plan U4, C_QE4): its title in capitals with a one-line value on the
 * right ("Net 30, 39% of credit"), then its body. `flash` highlights it when a send blocker points here
 * (decision 44).
 */
export function Panel({label,value,tone,flash=false,children}:{label:string;value:ReactNode;tone?:'bad';flash?:boolean;children:ReactNode}){
  const labelId=useId();
  return <section className={p.section} aria-labelledby={labelId} data-flash={flash||undefined}>
    <div className={p.sectionHead}>
      <span id={labelId} className={p.sectionTitle}>{label}</span>
      <span className={p.sectionValue} data-tone={tone}>{value}</span>
    </div>
    {children}
  </section>;
}

/** A label and its value on one row (C_QE4). */
export function Row({label,children,tone}:{label:ReactNode;children?:ReactNode;tone?:'bad'}){
  return <div className={p.kv}><span className={p.muted}>{label}</span><span className={p.kvValue} data-tone={tone}>{children}</span></div>;
}
