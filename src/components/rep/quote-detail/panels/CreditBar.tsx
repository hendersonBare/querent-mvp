import {creditPercent,type CreditBar as CreditBarModel} from '@/server/rep/quote-panels-math';
import {money} from '../format';
import p from './Panels.module.css';

/**
 * The credit bar (spec §4): a Querent-green segment for the open balance and a grey segment
 * extending from it for this quote, which follows the quote total as the rep edits. Over the
 * limit the grey stops at 100%, the end turns red and it says "Over limit by $X": a warning only.
 */
export function CreditBar({bar,openBalance,quoteTotal,limit}:{bar:CreditBarModel;openBalance:number|null;quoteTotal:number;limit:number}){
  const described=`Open balance ${money(openBalance??0)} is ${creditPercent(bar.used)} of the ${money(limit)} credit limit. `
    +`This quote adds ${money(quoteTotal)}: ${creditPercent(bar.withQuote)} with it${bar.overLabel?`. ${bar.overLabel}`:''}.`;
  return <div className={p.credit} data-over={bar.over||undefined} data-testid="credit-bar">
    <p className={p.creditHead}><span>Credit used, with this quote:</span> <b>{creditPercent(bar.withQuote)}</b></p>
    <div className={p.cbar} role="img" aria-label={described}>
      <i className={p.cOpen} style={{width:`${bar.open}%`}} data-segment="open"/>
      <i className={p.cQuote} style={{width:`${bar.quote}%`}} data-segment="quote"/>
      {bar.over&&<b className={p.cEnd} data-segment="over"/>}
    </div>
    <div className={p.legend} aria-hidden="true">
      <span><i data-k="open"/>Open balance {money(openBalance??0)}</span>
      <span><i data-k="quote"/>This quote {money(quoteTotal)}</span>
    </div>
    {bar.overLabel&&<p className={p.over}>{bar.overLabel}</p>}
  </div>;
}
