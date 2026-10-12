'use client';
import type {ReactNode} from 'react';
import {cx} from '@/components/ui/cx';
import {QuerentMark,SiteIcon} from './icons';
import s from './site.module.css';

/** The supplier's name over the box's heading (C_CVE0, C_CVL1). */
export const SUPPLIER_EYEBROW='HERRICK INDUSTRIAL SUPPLY';

/**
 * The Querent box (plan U10; C_CVE0 visitor, C_CVL1 customer): the welcome (the Querent mark, the
 * supplier, the heading, one line and four starter questions), or the conversation once it has turns
 * (no frame: the same column, scrolling), then the input with Send and "Powered by Querent". The
 * starters are drawn as boxes in the frames, so they are boxes with the button role here.
 */
export function QueryBox({heading,sub,starters,onStarter,startersDisabled=false,showWelcome,talk,question,onQuestion,onSubmit,busy=false,error}:{
  heading:ReactNode;sub:string;starters:readonly string[];onStarter:(question:string)=>void;startersDisabled?:boolean;
  /** The welcome shows until the conversation has turns. */
  showWelcome:boolean;
  /** The conversation (turns and quote messages), or null while there is none. */
  talk:ReactNode;
  question:string;onQuestion:(question:string)=>void;onSubmit:()=>void;busy?:boolean;error?:string;
}){
  const start=(q:string)=>{if(!startersDisabled)onStarter(q);};
  return <>
    <div className={cx(s.center,talk!==null&&s.centerTalk)} data-ui="box">
      {showWelcome&&<>
        <QuerentMark/>
        <div className={s.eyebrow}>{SUPPLIER_EYEBROW}</div>
        <h2 className={s.heading}>{heading}</h2>
        <div className={s.sub}>{sub}</div>
        <div className={s.starters}>
          {starters.map(q=><div key={q} role="button" tabIndex={0} aria-disabled={startersDisabled||undefined} className={s.starter}
            onClick={()=>start(q)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();start(q);}}}>{q}</div>)}
        </div>
      </>}
      {talk}
    </div>
    <div className={s.composerWrap}>
      {error&&<p className={s.error} role="alert">{error}</p>}
      <form className={s.composer} onSubmit={event=>{event.preventDefault();onSubmit();}}>
        <input className={s.input} aria-label="Ask a question" placeholder="Ask about stock, pricing, orders..." maxLength={4000} autoComplete="off"
          value={question} onChange={event=>onQuestion(event.target.value)}
          onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();onSubmit();}}}/>
        <button type="submit" aria-label="Send" className={s.send} disabled={busy}><SiteIcon name="send" size={18}/></button>
      </form>
      <div className={s.powered}>Powered by Querent</div>
    </div>
  </>;
}
