'use client';
import {useState} from 'react';
import type {QuoteStatus} from '@/domain';
import type {RepQuoteRow} from '@/server/rep/quotes';
import {Lane,LaneRow,ShowMoreButton,ViewNoteButton,type LaneSlot} from '@/components/ui';
import {EMPTY_LANE,REP_STATUS,flagText,listDate,marginText,money} from './labels';
import s from './Quotes.module.css';

// The board (plan U3; C_QOBoard, C_QOB7 show more, C_QOB8 reorder): one lane per status with its count
// and about a screen of cards, then "Show N more" and "Show less". Drag a lane's header, or press
// Alt+Left / Alt+Right on it, to move it; the order is the user's own (the page saves it). A card opens
// the quote preview; its View note opens the customer's note.

/** Cards a lane shows before "Show N more" (C_QOBoard's Accepted lane: 7, about one screen). */
export const LANE_PAGE=7;

export interface QuoteActions {
  /** The quote preview (C_QOB5). */
  onPreview:(row:RepQuoteRow)=>void;
  /** The customer's note (C_QOB6). */
  onNote:(row:RepQuoteRow)=>void;
}

export function QuotesBoard({rows,lanes,asOf,onMove,onPreview,onNote}:{rows:readonly RepQuoteRow[];lanes:readonly QuoteStatus[];asOf:string;
  onMove:(from:number,to:number)=>void}&QuoteActions){
  return <LaneRow ids={lanes} onMove={onMove} label="Board columns">
    {lane=>{
      const status=lane.id as QuoteStatus;
      return <BoardLane key={lane.id} {...lane} status={status} rows={rows.filter(r=>r.status===status)} asOf={asOf} onPreview={onPreview} onNote={onNote}/>;
    }}
  </LaneRow>;
}

function BoardLane({status,rows,asOf,onPreview,onNote,...lane}:LaneSlot&{status:QuoteStatus;rows:readonly RepQuoteRow[];asOf:string}&QuoteActions){
  const [open,setOpen]=useState(false);
  const shown=open?rows:rows.slice(0,LANE_PAGE);
  const more=rows.length-LANE_PAGE;
  return <Lane {...lane} label={REP_STATUS[status].label} count={rows.length}>
    {shown.map(row=><QuoteCard key={row.id} row={row} asOf={asOf} onPreview={onPreview} onNote={onNote}/>)}
    {more>0&&<ShowMoreButton variant="lane" onClick={()=>setOpen(!open)}><span>{open?'Show less':`Show ${more} more`}</span></ShowMoreButton>}
    {rows.length===0&&<div className={s.empty}>{EMPTY_LANE}</div>}
  </Lane>;
}

/**
 * The quote number, which opens the preview: the frame's bold text (an inline span), focusable and pressed
 * with Enter or Space like a button. A click on it reaches the card or row, which opens the preview.
 */
export function QuoteNumber({number,onOpen}:{number:string;onOpen:()=>void}){
  return <span role="button" tabIndex={0} className={s.number}
    onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onOpen();}}}>{number}</span>;
}

/** One quote on the board, as C_QOBoard draws it. Each value sits in an inline span, like the frame's filled-in values. */
function QuoteCard({row,asOf,onPreview,onNote}:{row:RepQuoteRow;asOf:string}&QuoteActions){
  const flag=flagText(row);
  return <div role="article" aria-label={row.quote_number} data-ui="quote-card" className={s.card} onClick={()=>onPreview(row)}>
    <div className={s.cardTop}>
      <span><QuoteNumber number={row.quote_number} onOpen={()=>onPreview(row)}/></span>
      <span className={s.cardDate}><span>{listDate(row.requested_at,asOf)}</span></span>
    </div>
    <div className={s.cardCustomer}><span>{row.customer_name}</span></div>
    {row.change_request&&<ViewNoteButton variant="card" onClick={event=>{event.stopPropagation();onNote(row);}}/>}
    <div className={s.cardFigures}>
      <span className={s.cardTotal}><span>{money(row.total)}</span></span>
      <span className={s.cardMargin}><span>{marginText(row)}</span></span>
    </div>
    {flag&&<div className={s.cardFlag}><span>{flag}</span></div>}
  </div>;
}
