'use client';
import {useCallback,useId} from 'react';
import type {CustomerQuoteSummary} from '@/domain';
import type {API} from '@/lib/contracts';
import {usePoll} from '@/lib/use-poll';
import {emitOpenQuote} from './open-quote';
import {quoteButtonLabel,STATUS_CHIPS} from './quote-label';

// Right sidebar (spec §3): one button per quote, newest first, labelled "Quote · date · $total"
// with a status chip. The server sends the status to show now, so an overdue sent quote reads
// Expired. Clicking emits "open quote" for the PDF preview modal (task 5.1).

export function QuotesSidebar({api,now}:{api:API;now?:string}){
  const load=useCallback(()=>api.get<CustomerQuoteSummary[]>('customer/quotes'),[api]);
  const {data,error}=usePoll(load);
  const heading=useId();
  const at=now??new Date().toISOString();
  return <div className="cx-quotes-panel">
    <div className="cx-panel-head">
      <h2 className="eyebrow cx-eyebrow" id={heading}>Your quotes</h2>
      {data&&data.length>0&&<span className="count-badge">{data.length}</span>}
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    {!data?(!error&&<p className="muted" role="status">Loading quotes…</p>)
      :data.length===0?<p className="muted cx-note">No quotes yet. Ask Querent for a quote in the chat and it will show up here.</p>
      :<ul className="cx-quotes" aria-labelledby={heading}>
        {data.map(q=>{
          const chip=STATUS_CHIPS[q.status];
          return <li key={q.id}>
            <button type="button" className="cx-quote" onClick={()=>emitOpenQuote({id:q.id,quote_number:q.quote_number})}>
              <span className="cx-quote-label">{quoteButtonLabel(q,at)}</span>
              <span className="cx-quote-meta">
                <span className="cx-quote-number">{q.quote_number}</span>
                <span className={`cx-chip cx-chip-${chip.tone}`}>{chip.label}</span>
              </span>
            </button>
          </li>;
        })}
      </ul>}
  </div>;
}
