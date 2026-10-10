import {Clock,TriangleAlert} from 'lucide-react';
import {AGING_LABELS,type Aging} from '@/server/quotes/aging';
import s from './QuotesList.module.css';

// The aging marker (v3 spec §3, decision 18): amber is a clock and "Aging", red an alert and
// "Overdue", so the level never rests on colour alone. The reason ("Sent 4 days ago") is the
// tooltip, and is read out after the word. Nothing shows for a fine or final quote.

export function AgingMarker({aging}:{aging:Aging|null}){
  if(!aging||aging.level==='ok')return null;
  const Icon=aging.level==='red'?TriangleAlert:Clock;
  return <span className={s.aging} data-level={aging.level} title={aging.reason}>
    <Icon aria-hidden="true" size={12} strokeWidth={2.2}/>{AGING_LABELS[aging.level]}<span className={s.srOnly}>: {aging.reason}</span>
  </span>;
}
