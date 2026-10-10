'use client';
import {useState,type FormEvent} from 'react';
import {AGING_LABELS,AGING_LIMITS,AGING_ROWS,checkAgingThresholds,type AgingThresholds} from '@/server/quotes/aging';
import {repPageStyles as page} from '../RepPage';
import {saveSetting} from './api';
import s from './Settings.module.css';

// Settings > Aging (v3 spec §1.3, §3, §6; decision 16; task D1), manager only: when a quote turns
// Aging (amber) and Overdue (red) for each status clock, in wall-clock hours. All six save together
// through PUT /api/rep/settings/aging, checked as the manager types with the server's own rule.

type Key=keyof AgingThresholds;
const KEYS=AGING_ROWS.flatMap(r=>[r.amber,r.red]);
/** When each status's clock starts (spec §3). */
const CLOCK:Record<(typeof AGING_ROWS)[number]['label'],string>={
  'Ready for review':'From when the quote is created.',
  'Changes requested':'From the customer’s change request.',
  Sent:'From the latest send. A sent quote is also Aging the day before it expires and Overdue on its last day.',
};

const asText=(aging:AgingThresholds)=>Object.fromEntries(KEYS.map(key=>[key,String(aging[key])])) as Record<Key,string>;
const asNumbers=(text:Record<Key,string>)=>Object.fromEntries(KEYS.map(key=>[key,text[key].trim()===''?Number.NaN:Number(text[key])]));
/** "3 days" under a whole number of days (24 h and up), so 72 and 168 read as the decision's 3 and 7 days. */
const inDays=(text:string)=>{const hours=Number(text);return Number.isInteger(hours)&&hours>=24&&hours%24===0?`${hours/24} ${hours===24?'day':'days'}`:'';};

export function AgingSettings({aging,onSaved}:{aging:AgingThresholds;onSaved:(aging:AgingThresholds)=>void}){
  const [text,setText]=useState(()=>asText(aging));
  // The thresholds as last stored: the prop, or what the server returned for this card's save.
  const [stored,setStored]=useState(aging),[seen,setSeen]=useState(aging);
  if(aging!==seen){setSeen(aging);setStored(aging);setText(asText(aging));}
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);

  const {thresholds,problem}=checkAgingThresholds(asNumbers(text));
  const changed=thresholds!==null&&KEYS.some(key=>thresholds[key]!==stored[key]);
  const edited=KEYS.some(key=>text[key]!==String(stored[key]));

  async function save(event:FormEvent){
    event.preventDefault();
    if(!thresholds||!changed||saving)return;
    setSaving(true);setError('');setSaved(false);
    try{
      const result=await saveSetting<AgingThresholds>('aging',thresholds);
      setStored(result);setText(asText(result));onSaved(result);setSaved(true);
    }
    catch(e){setError(e instanceof Error?e.message:'The thresholds weren’t saved. Try again.');}
    finally{setSaving(false);}
  }
  const cancel=()=>{setText(asText(stored));setError('');setSaved(false);};

  const field=(key:Key,label:string,level:'amber'|'red')=>{
    const days=inDays(text[key]);
    return <span className={s.hours}>
      <span className={s.cellWord}>{level==='amber'?AGING_LABELS.amber:AGING_LABELS.red} after </span>
      <span className={s.field}>
        <input type="number" inputMode="numeric" min={AGING_LIMITS.minH} max={AGING_LIMITS.maxH} step={1} value={text[key]} disabled={saving}
          aria-label={`${label} ${level} hours`} onChange={event=>{setText(current=>({...current,[key]:event.target.value}));setSaved(false);setError('');}}/>
        <span aria-hidden="true">h</span>
      </span>
      {days&&<span className={s.sub}>{days}</span>}
    </span>;
  };

  return <section className={`${page.card} ${s.card}`} aria-labelledby="settings-aging">
    <div className={s.head}>
      <h2 id="settings-aging">Aging thresholds</h2>
      <p>When an open quote is marked Aging (amber) and Overdue (red) on the Quotes list. Needs attention shows both; the header badge counts Overdue quotes. Wall-clock hours, for every rep.</p>
    </div>
    <form onSubmit={event=>void save(event)} noValidate>
      {(error||problem)&&<p className={s.error} role="alert">{error||problem}</p>}
      <table className={`${s.table} ${s.stack}`}>
        <caption className={s.srOnly}>Hours until a quote is Aging and Overdue, by status</caption>
        <thead>
          <tr><th scope="col">Status</th><th scope="col">{AGING_LABELS.amber} (amber) after</th><th scope="col">{AGING_LABELS.red} (red) after</th></tr>
        </thead>
        <tbody>
          {AGING_ROWS.map(row=><tr key={row.label}>
            <th scope="row"><span className={s.name}>{row.label}</span><span className={s.sub}>{CLOCK[row.label]}</span></th>
            <td>{field(row.amber,row.label,'amber')}</td>
            <td>{field(row.red,row.label,'red')}</td>
          </tr>)}
        </tbody>
      </table>
      <div className={s.rateActions}>
        <button type="submit" className={s.save} disabled={!changed||saving}>{saving?'Saving…':'Save thresholds'}</button>
        {edited&&<button type="button" className={s.save} disabled={saving} onClick={cancel}>Cancel</button>}
        <span className={s.floorNote} role="status" data-tone="ok">{saved&&!edited?'Saved':''}</span>
      </div>
    </form>
    <p className={s.foot}>Whole hours from {AGING_LIMITS.minH} to {AGING_LIMITS.maxH} (90 days), Aging before Overdue. Quotes are re-marked the next time a list or quote loads.</p>
  </section>;
}
