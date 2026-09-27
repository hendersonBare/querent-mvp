'use client';
import {useMemo} from 'react';
import {ChevronRight} from 'lucide-react';
import type {RepUpsell} from '@/server/rep/quote-upsells';
import type {QuoteEditor} from '../use-quote-editor';
import {chipFigures,chipGain,openUpsells,takeVerb,upsellsMeta} from './upsell-view';
import {useUpsells} from './use-upsells';
import s from '../QuoteDetail.module.css';
import u from './Upsells.module.css';

// "Suggested by Querent" on the quote detail (spec §4, §5.5; task 3.6; mockup .sugbox, screens
// 03-04 and 08): collapsed, like the mockup, to one row with "Querent found +$Y GP" (spec §5.1
// rule 4) and "N ideas · up to +$X gross profit". Open, each chip reads as Querent's wording
// (Claude's in live mode, the template in scripted mode), its qty, price, margin and GP gain, and
// one click takes it: an autosaved edit like any other, so Undo takes it back. A quote that can't
// be edited offers no chips; its row still shows what Querent found.

const FOUND_NOTE='What Querent’s suggested prices add over the customer’s price, at these quantities. Contract lines add nothing.';

export function UpsellsSection({editor,querentFound}:{editor:QuoteEditor;querentFound:string}){
  const {detail,lines}=editor;
  const {quote,editable}=detail;
  const state=useUpsells(quote.id,editable,detail);
  const chips=useMemo(()=>openUpsells(state.upsells,lines),[state.upsells,lines]);
  const meta=upsellsMeta(state.status,chips,editable);
  const heading=<>
    <h2 id="upsells-title" className={u.title}>Suggested by Querent</h2>
    <span className={u.found} title={FOUND_NOTE}>{querentFound}</span>
    <span className={u.meta} role="status">{meta}</span>
  </>;

  if(!editable)return <section className={`${s.card} ${u.box}`} aria-labelledby="upsells-title"><div className={u.head}>{heading}</div></section>;
  return <details className={`${s.card} ${u.box}`} aria-labelledby="upsells-title">
    <summary className={u.head}><ChevronRight aria-hidden="true" size={14} strokeWidth={2} className={`${s.chev} ${u.chev}`}/>{heading}</summary>
    {chips.length?<ul className={u.list}>{chips.map(chip=><UpsellRow key={chip.id} chip={chip} taking={editor.takingUpsells.has(chip.id)} onTake={()=>editor.takeUpsell(chip)}/>)}</ul>
      :<p className={u.empty}>{state.status==='loading'?'Querent is looking for ideas for this quote.':state.status==='error'?'Suggestions couldn’t be loaded. They’ll try again after your next change.':'Nothing more to suggest for these lines.'}</p>}
  </details>;
}

function UpsellRow({chip,taking,onTake}:{chip:RepUpsell;taking:boolean;onTake:()=>void}){
  const verb=takeVerb(chip);
  return <li className={u.chip} data-kind={chip.kind}>
    <div className={u.text}>
      <p className={u.chipTitle}>{chip.wording.title}</p>
      <p className={u.reason}>{chip.wording.reason}</p>
      <p className={u.figures}><span className={s.sku}>{chip.item.sku}</span> · {chipFigures(chip)} · <b className={u.gain}>{chipGain(chip)}</b></p>
    </div>
    <button type="button" className={s.btn} onClick={onTake} disabled={taking} aria-label={`${verb}: ${chip.wording.title}`}>{taking?(verb==='Add'?'Adding…':'Applying…'):verb}</button>
  </li>;
}
