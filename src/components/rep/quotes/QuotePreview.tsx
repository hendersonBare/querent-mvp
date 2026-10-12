'use client';
import Link from 'next/link';
import type {RepQuoteRow} from '@/server/rep/quotes';
import {Sheet} from '@/components/ui';
import {REP_STATUS,flagText,listDate,marginText,money,noteDay,replyTo} from './labels';
import s from './Quotes.module.css';

// The quote preview (plan U3; C_QOB5 from the board, C_QOT3 from the table): the U0 side sheet with the
// quote number and customer, the red line when something is wrong, Total, Requested and Margin, the
// status, the customer's change request note, then Open quote and "Reply to Dana" (which opens the note
// with its reply box, C_QOB6). A quote with no note has no note box and no Reply (decision 63), and
// another rep's quote (`canReply` false: the manager reads it read-only, decision 22) has no Reply
// (no frame: the minimum, docs/plans/status.md "No frame").

export function QuotePreview({row,asOf,canReply,onClose,onReply}:{row:RepQuoteRow|null;asOf:string;canReply:boolean;onClose:()=>void;onReply:(row:RepQuoteRow)=>void}){
  const flag=row?flagText(row):null;
  const note=row?.change_request;
  return <Sheet open={!!row} title={row?.quote_number??''} subtitle={row?.customer_name} onClose={onClose}>
    {row&&<>
      {flag&&<div className={s.previewFlag}>{flag}</div>}
      <div className={s.figures}>
        <div><div className={s.figureLabel}>Total</div><div className={s.figureValue}>{money(row.total)}</div></div>
        <div className={s.centre}><div className={s.figureLabel}>Requested</div><div className={s.figureValue}>{listDate(row.requested_at,asOf)}</div></div>
        <div className={s.end}><div className={s.figureLabel}>Margin</div><div className={s.figureValue}>{marginText(row)}</div></div>
      </div>
      <div className={s.statusLine}>{`Status: ${REP_STATUS[row.status].label}`}</div>
      {note&&<div className={s.noteBox}>
        <div className={s.noteWho}>{[note.by??row.customer_name,note.at?noteDay(note.at):null].filter(Boolean).join(', ')}</div>
        <div className={s.noteWords}>{`"${note.note}"`}</div>
      </div>}
      <div className={s.previewActions}>
        {/* No prefetch: opening the quote marks it read. */}
        <Link href={`/rep/quotes/${encodeURIComponent(row.quote_number)}`} prefetch={false} className={s.openQuote}>Open quote</Link>
        {note&&canReply&&<button type="button" className={s.replyButton} onClick={()=>onReply(row)}>{`Reply to ${replyTo(row)}`}</button>}
      </div>
    </>}
  </Sheet>;
}
