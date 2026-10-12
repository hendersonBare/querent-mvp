'use client';
import {useId,useMemo,useState,type KeyboardEvent} from 'react';
import type {RepUpsell} from '@/server/rep/quote-upsells';
import type {QuoteEditor} from '../use-quote-editor';
import {chipFigures,chipGain,openUpsells,takeVerb,upsellsMeta} from './upsell-view';
import {useUpsells} from './use-upsells';
import s from '../QuoteDetail.module.css';

// "Suggested by Querent" under the Items card (plan U4; C_QEBase closed, C_QE5 open; spec §4, §5.5; task
// 3.6): one title bar with "Querent found +$Y GP" (spec §5.1 rule 4) and "N ideas, up to +$X gross
// profit". Its title bar opens and closes it. Open, each idea reads as Querent's wording (Claude's in
// live mode, the template in scripted mode), its SKU, qty, price, margin and GP gain, and one click takes
// it: an autosaved edit like any other, so Undo takes it back. The server applies a chip only as it was
// shown; one that changed since is refused, the reason shows here, and the chips refresh. A quote that
// can't be edited offers no ideas; its bar still shows what Querent found.

const FOUND_NOTE='What Querent’s suggested prices add over the customer’s price, at these quantities. Contract lines add nothing.';

export function UpsellsSection({editor,querentFound}:{editor:QuoteEditor;querentFound:string}){
  const {detail,lines}=editor;
  const {quote,editable}=detail;
  const state=useUpsells(quote.id,editable,detail);
  const chips=useMemo(()=>openUpsells(state.upsells,lines),[state.upsells,lines]);
  const meta=upsellsMeta(state.status,chips,editable);
  const [open,setOpen]=useState(false);
  const titleId=useId(),bodyId=useId();
  const toggle=()=>{if(editable)setOpen(o=>!o);};
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}};

  return <section className={s.card} aria-label="Suggested by Querent">
    <div className={`${s.titlebar} ${s.suggestHead}`} role={editable?'button':undefined} tabIndex={editable?0:undefined} aria-expanded={editable?open:undefined}
      aria-controls={editable?bodyId:undefined} onClick={toggle} onKeyDown={editable?onKey:undefined}>
      <div id={titleId} className={s.suggestTitle}>Suggested by Querent<span className={s.found} title={FOUND_NOTE}>{querentFound}</span></div>
      <div className={s.suggestMeta} role="status">{meta}</div>
    </div>
    {editable&&open&&<div id={bodyId}>
      {editor.upsellError&&<div className={s.plain} data-tone="error" role="alert">{editor.upsellError}<button type="button" className={s.plainButton} onClick={editor.dismissUpsellError}>Dismiss</button></div>}
      {chips.length?<div role="list" aria-label="Ideas">{chips.map(chip=><Idea key={chip.id} chip={chip} taking={editor.takingUpsells.has(chip.id)} onTake={()=>editor.takeUpsell(chip)}/>)}</div>
        :<div className={s.plain}>{state.status==='loading'?'Querent is looking for ideas for this quote.':state.status==='error'?'Suggestions couldn’t be loaded. They’ll try again after your next change.':'Nothing more to suggest for these lines.'}</div>}
    </div>}
  </section>;
}

function Idea({chip,taking,onTake}:{chip:RepUpsell;taking:boolean;onTake:()=>void}){
  const verb=takeVerb(chip);
  return <div className={s.idea} data-kind={chip.kind} role="listitem">
    <div>
      <div className={s.ideaTitle} data-ui="idea-title">{chip.wording.title}</div>
      <div className={s.ideaReason}>{chip.wording.reason}</div>
      <div className={s.ideaFigures}><span className={s.mono}>{chip.item.sku}</span>{`, ${chipFigures(chip)}, `}<b>{chipGain(chip)}</b></div>
    </div>
    <button type="button" className={s.ideaButton} onClick={onTake} disabled={taking} aria-label={`${verb}: ${chip.wording.title}`}>{taking?(verb==='Add'?'Adding…':'Applying…'):verb}</button>
  </div>;
}
