import Link from 'next/link';
import type {QuoteSummary} from '@/server/repository/types';
import {QUOTE_COPY} from './copy';
import {formatMoney} from './format';
import {LocalDateTime} from './LocalDateTime';
import s from './Quotes.module.css';

// The /quotes list (docs/boxt/plan.md B6): one white card with the table, newest first as the repository
// lists them. Customer, Reference, Lines (with the unmatched count when there are any), Total, Created by,
// Created. The example quote carries an "Example" tag. The customer cell's link covers its whole row.

const None=()=><span className={s.none}>{QUOTE_COPY.none}</span>;

export function QuotesTable({quotes}:{quotes:readonly QuoteSummary[]}){
  if(quotes.length===0){
    return <p className={s.emptyLine}>{QUOTE_COPY.empty} <Link href="/quote-tool">{QUOTE_COPY.emptyLink}</Link>.</p>;
  }
  return <div className={s.card}>
    <div className={s.scroll}>
      <table className={s.table} aria-label="Quotes">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Reference</th>
            <th scope="col" className={s.num}>Lines</th>
            <th scope="col" className={s.num}>Total</th>
            <th scope="col">Created by</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map(q=><tr key={q.id} className={s.linkRow}>
            <td>
              <span className={s.customerCell}>
                <Link href={`/quotes/${q.id}`} className={s.rowLink}>{q.customerName||<None/>}</Link>
                {q.isExample&&<span className={s.tag}>{QUOTE_COPY.example}</span>}
              </span>
            </td>
            <td className={s.secondaryText}>{q.reference||<None/>}</td>
            <td className={s.num}>
              {q.lineCount}
              {q.unmatchedCount>0&&<span className={s.muted}> · {q.unmatchedCount} unmatched</span>}
            </td>
            <td className={`${s.num} ${s.money}`}>{formatMoney(q.total)}</td>
            <td className={s.secondaryText}>{q.createdByEmail||<None/>}</td>
            <td className={s.secondaryText}><LocalDateTime iso={q.createdAt}/></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
