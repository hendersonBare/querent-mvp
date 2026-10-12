'use client';
import {useState,type ReactNode} from 'react';
import {cx} from '@/components/ui/cx';
import {AGING_ROWS,checkAgingThresholds,type AgingThresholds} from '@/server/quotes/aging';
import {saveSetting} from './api';
import {AGING_STATUS,inDays} from './format';
import {Card,GridHead,Problem,SaveButton,SettingsFrame} from './parts';
import s from './Settings.module.css';

// Settings > Aging (v3 spec §1.3, §3, §6; decision 16; tasks D1, U8; C_S8), the manager's: when a quote turns
// Aging (amber) and Overdue (red) for each status clock, in wall-clock hours. All six save together through
// PUT /api/rep/settings/aging, checked as the manager types with the server's own rule. No descriptions
// (Appendix E); the "1 day" conversions stay, drawn as C_S8 draws them: beside a red field in their own 13px
// line, and inside an amber field's "h" unit ("h  3 days"). No frame: the "Saved" line beside Save.

type Key=keyof AgingThresholds;
const KEYS=AGING_ROWS.flatMap(r=>[r.amber,r.red]);
const asText=(aging:AgingThresholds)=>Object.fromEntries(KEYS.map(key=>[key,String(aging[key])])) as Record<Key,string>;
const asNumbers=(text:Record<Key,string>)=>Object.fromEntries(KEYS.map(key=>[key,text[key].trim()===''?Number.NaN:Number(text[key])]));

export function AgingSettings({aging,tabs}:{aging:AgingThresholds;tabs:ReactNode}){
  const [stored,setStored]=useState(aging);
  const [text,setText]=useState(()=>asText(aging));
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const {thresholds,problem}=checkAgingThresholds(asNumbers(text));
  const changed=thresholds!==null&&KEYS.some(key=>thresholds[key]!==stored[key]);

  async function save(){
    if(!thresholds||saving)return;
    if(!changed){setSaved(false);return;}
    setSaving(true);setError('');setSaved(false);
    try{const result=await saveSetting<AgingThresholds>('aging',thresholds);setStored(result);setText(asText(result));setSaved(true);}
    catch(e){setError(e instanceof Error?e.message:'The thresholds weren’t saved. Try again.');}
    finally{setSaving(false);}
  }

  const field=(key:Key,label:string,level:'amber'|'red')=>{
    const days=inDays(text[key]);
    const input=<div className={s.unit}>
      <input type="text" inputMode="numeric" autoComplete="off" className={cx(s.box,s.w90)} value={text[key]} disabled={saving} aria-label={`${label} ${level} hours`}
        onChange={e=>{const value=e.target.value;setText(t=>({...t,[key]:value}));setSaved(false);setError('');}}/>
      <span className={s.unitText}>{level==='amber'&&days?`h  ${days}`:'h'}</span>
    </div>;
    return level==='red'?<div role="cell" className={s.agingRed}>{input}{days&&<span className={s.days}>{days}</span>}</div>:<div role="cell">{input}</div>;
  };

  return <SettingsFrame tabs={tabs}>
    <Card title="Aging thresholds" saved={saved} action={<SaveButton label="Save thresholds" disabled={!thresholds||saving} onClick={()=>void save()}/>}>
      <Problem>{error||problem}</Problem>
      <div role="table" aria-label="Aging thresholds">
        <GridHead className={s.agingGrid} labels={['Status','Aging (amber) after','Overdue (red) after']}/>
        {AGING_ROWS.map(row=>{
          const label=AGING_STATUS[row.label];
          return <div key={row.label} role="row" className={`${s.gridRow} ${s.agingGrid}`}>
            <div role="rowheader"><div className={s.strong}>{label}</div></div>
            {field(row.amber,label,'amber')}
            {field(row.red,label,'red')}
          </div>;
        })}
      </div>
    </Card>
  </SettingsFrame>;
}
