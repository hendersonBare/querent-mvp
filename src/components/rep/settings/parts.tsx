'use client';
import {useId,type InputHTMLAttributes,type ReactNode} from 'react';
import {cx} from '@/components/ui/cx';
import {RepPageHeader} from '../RepPage';
import s from './Settings.module.css';

// The pieces every Settings tab is built from (plan U8; C_S1 to C_S8): the page frame (header, tabs, body),
// a card with its dark title bar, a setting's row, a right-aligned number field, and the grid table header.

/** The page: the header (with the tab's own controls), the tab strip, then the cards (C_S1). */
export function SettingsFrame({tabs,controls,children}:{tabs:ReactNode;controls?:ReactNode;children:ReactNode}){
  return <>
    <RepPageHeader title="Settings">{controls}</RepPageHeader>
    {tabs}
    <div className={cx('ui-root',s.body)}>{children}</div>
  </>;
}

/**
 * A card: a section named by its title, the title bar (title, the one line the frame draws, the green action
 * with its Saved line), then its rows. `review` is C_S2's Rep margins bar (one line, the card's own corners).
 */
export function Card({title,note,action,saved,review=false,children}:{title:string;note?:ReactNode;action?:ReactNode;saved?:boolean;review?:boolean;children:ReactNode}){
  const id=useId();
  return <section className={cx(s.card,review&&s.open)} aria-labelledby={id}>
    <div className={cx(s.bar,review&&s.barReview)}>
      <h2 id={id} className={s.cardTitle}>{title}</h2>
      {note&&<span className={review?s.reviewNote:s.barNote}>{note}</span>}
      {action&&<span className={s.barAction}><span role="status" className={s.saved}>{saved?'Saved':''}</span>{action}</span>}
    </div>
    {children}
  </section>;
}

/**
 * The green action on a title bar ("Save rates", "Save floors"). `drawnOff`: a rep's tabs, whose disabled
 * Save C_RS3 draws grey (#C4C7C5) rather than the dimmed green of "States not drawn".
 */
export function SaveButton({label,disabled,onClick,drawnOff=false}:{label:string;disabled:boolean;onClick:()=>void;drawnOff?:boolean}){
  return <button type="button" className={cx(s.green,drawnOff&&s.greenOff)} disabled={disabled} onClick={onClick}>{label}</button>;
}

/** One plain red line under the title bar (decision 52): what is wrong, or the server's reason. */
export function Problem({children}:{children:ReactNode}){
  return children?<p className={s.problem} role="alert">{children}</p>:null;
}

/** A setting's row: its name and the unit line under it (C_S4 "Miles. Farther is call for freight") on the left, the control on the right. */
export function SettingRow({label,sub,htmlFor,children}:{label:string;sub?:string;htmlFor?:string;children:ReactNode}){
  return <div className={s.row}>
    <div>
      {htmlFor?<label className={s.name} htmlFor={htmlFor}>{label}</label>:<div className={s.name}>{label}</div>}
      {sub&&<div className={s.sub}>{sub}</div>}
    </div>
    <div>{children}</div>
  </div>;
}

/** A right-aligned number field (C_S4 100px, C_S6 90px, C_S2 80px), with "$" before it or a unit after it. */
export function NumberField({id,width,prefix,unit,invalid,...rest}:{id:string;width:100|90|80;prefix?:string;unit?:string;invalid?:boolean}&Omit<InputHTMLAttributes<HTMLInputElement>,'id'|'type'|'width'>){
  return <div className={s.unit}>
    {prefix&&<span className={s.unitText} aria-hidden="true">{prefix}</span>}
    <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} className={cx(s.box,s[`w${width}`])} aria-invalid={invalid||undefined} {...rest}/>
    {unit&&<span className={s.unitText} aria-hidden="true">{unit}</span>}
  </div>;
}

/** A grid table's gray header row: "::" before each label, as every Settings table draws it. */
export function GridHead({labels,className,right=[]}:{labels:readonly string[];className:string;right?:readonly number[]}){
  return <div role="row" className={cx(s.head,className)}>
    {labels.map((l,i)=><div key={l} role="columnheader" className={right.includes(i)?s.alignRight:undefined}>{`:: ${l}`}</div>)}
  </div>;
}
