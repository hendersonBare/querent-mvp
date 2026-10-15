'use client';
import type {RepQuoteRow} from '@/server/rep/quotes';
import {DataTable,StatusText,ViewNoteButton,type DataColumn,type TablePrefs} from '@/components/ui';
import {QuoteNumber,type QuoteActions} from './QuotesBoard';
import {TABLE_ID} from './filters';
import {EMPTY_LANE,REP_STATUS,flagText,listDate,marginText,money,validUntil} from './labels';
import s from './Quotes.module.css';

// The table (plan U3; C_QOTable, C_QOT2 columns, C_QOT5 show more, C_QOT6 reorder): Quote, Customer,
// Requested, Status, Total, Margin, then the columns C_QOT2 offers hidden: Rep (the manager only),
// Valid until and Purchasing agent. Column order and visibility are the user's own (table "quotes").
// A row opens the quote preview; its View note opens the customer's note. Each value sits in an inline
// span, like the frame's filled-in values.

/** Rows before "Show N more quotes" (C_QOTable: 14, about one screen). */
export const TABLE_PAGE=14;

export function quoteColumns({manager,asOf,onPreview,onNote}:{manager:boolean;asOf:string}&QuoteActions):DataColumn<RepQuoteRow>[]{
  const columns:(DataColumn<RepQuoteRow>|false)[]=[
    {id:'quote',label:'Quote',track:'1fr',alwaysShown:true,
      render:row=><QuoteNumber number={row.quote_number} onOpen={()=>onPreview(row)}/>},
    {id:'customer',label:'Customer',track:'2.2fr',render:row=><span>{row.customer_name}</span>},
    {id:'requested',label:'Requested',track:'0.9fr',render:row=><span className={s.requested}>{listDate(row.requested_at,asOf)}</span>},
    {id:'status',label:'Status',track:'1.5fr',render:row=><>
      <StatusText status={REP_STATUS[row.status].label} flag={flagText(row)}/>
      {row.change_request&&<ViewNoteButton onClick={event=>{event.stopPropagation();onNote(row);}}/>}
    </>},
    {id:'total',label:'Total',track:'1fr',align:'right',render:row=><span className={s.total}>{money(row.total)}</span>},
    {id:'margin',label:'Margin',track:'0.9fr',align:'right',render:row=><span className={s.margin}>{marginText(row)}</span>},
    // No frame draws these three shown (C_QOT2 lists them unticked): the same cell style, a fluid track each.
    manager&&{id:'rep',label:'Rep',track:'1fr',hiddenByDefault:true,render:row=><span>{row.rep_name}</span>},
    {id:'valid',label:'Valid until',track:'1fr',hiddenByDefault:true,render:row=><span className={s.requested}>{validUntil(row.valid_until,asOf)}</span>},
    {id:'agent',label:'Purchasing agent',track:'1fr',hiddenByDefault:true,render:row=><span>{row.contact_name??''}</span>},
  ];
  return columns.filter((c):c is DataColumn<RepQuoteRow>=>!!c);
}

export function QuotesTable({rows,manager,asOf,prefs,onPreview,onNote}:{rows:readonly RepQuoteRow[];manager:boolean;asOf:string;prefs:TablePrefs|null}&QuoteActions){
  return <DataTable<RepQuoteRow> tableId={TABLE_ID} label="Quotes" columns={quoteColumns({manager,asOf,onPreview,onNote})} rows={rows} rowKey={r=>r.id}
    pageSize={TABLE_PAGE} moreLabel={n=>`Show ${n} more quotes`} lessLabel="Show fewer quotes" minWidth={880} divider="soft" gap={16}
    initialPrefs={prefs} onRowClick={onPreview} empty={<div className={s.noRows}>{EMPTY_LANE}</div>} style={{marginTop:24}}/>;
}
