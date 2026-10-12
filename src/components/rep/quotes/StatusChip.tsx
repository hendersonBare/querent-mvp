import type {QuoteStatus} from '@/domain';
import {REP_STATUS} from './labels';
import s from './QuotesList.module.css';

/**
 * The old status chip, kept only for the quote page's header (src/components/rep/quote-detail) until plan
 * U4 rebuilds it. The Quotes page itself shows status as plain text (C_QOTable, StatusText).
 */
export function StatusChip({status}:{status:QuoteStatus}){
  const {label,tone}=REP_STATUS[status];
  return <span className={s.chip} data-tone={tone}>{label}</span>;
}
