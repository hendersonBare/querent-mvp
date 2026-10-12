'use client';
import {useState,type ReactNode} from 'react';
import {cx} from '@/components/ui/cx';
import type {OrgFloorCell,RepFloorSet} from '@/server/rep/settings';
import {RequestError,saveSetting} from './api';
import {floorInput,floorPosition,parseFloorPct} from './format';
import {Card,Problem,SaveButton,SettingsFrame} from './parts';
import s from './Settings.module.css';

// Settings > Margins, a rep's (plan U9; C_RS1, C_RS3): their own margin per product category ("margin
// floors" in the database), each against the organization floor their manager sets, which they may not go
// below (Appendix C). Each row: the category, the 0% to 50% bar (filled to the rep's margin, the dark tick at
// the organization floor, the green tick at the margin), the 80px field and the floor. Below the floor the
// row turns red, C_RS3's sentence names the real floor under it, and Save margins is disabled (drawn grey).
// The legend stays under the rows. Save sends every changed margin together (PUT /api/rep/settings/floors
// {floors}); the server refuses a margin below the floor field by field, and a floor raised meanwhile shows
// in its row. No frame: the "Saved" line, and one red line for a field that is not a margin (decision 52).

const MARGIN_PROBLEM='Enter a margin from 0 to 99.9.';

/** C_RS3: "Below the 30.0% organization floor. Pick 30.0% or higher." */
const belowFloor=(label:string)=>`Below the ${label} organization floor. Pick ${label} or higher.`;
/** A floor's label at the 0.1-point precision margins are compared at ("30.0%"). */
const floorLabel=(fraction:number)=>`${floorInput(fraction)}%`;
const tenths=(fraction:number)=>Math.round(Number((fraction*1000).toPrecision(12)));

export function RepMargins({mine,orgFloors,tabs}:{mine:RepFloorSet;orgFloors:OrgFloorCell[];tabs:ReactNode}){
  const [stored,setStored]=useState(mine.floors);
  const [floors,setFloors]=useState(()=>new Map(orgFloors.map(f=>[f.category_id,f.floor])));
  const [text,setText]=useState(()=>Object.fromEntries(mine.floors.map(f=>[f.category_id,floorInput(f.margin_floor)])) as Record<string,string>);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);

  const rows=stored.map(f=>{
    const parsed=parseFloorPct(text[f.category_id]??'');
    const floor=floors.get(f.category_id)??0;
    const below=parsed!==null&&Math.round(parsed*10)<tenths(floor);
    return {...f,parsed,floor,below,changed:parsed!==null&&parsed!==Number(floorInput(f.margin_floor))};
  });
  const invalid=rows.some(r=>r.parsed===null),anyBelow=rows.some(r=>r.below);

  async function save(){
    if(invalid||anyBelow||saving)return;
    const changed=rows.filter(r=>r.changed);
    if(!changed.length){setSaved(false);return;}
    setSaving(true);setError('');setSaved(false);
    try{
      const next=await saveSetting<RepFloorSet>('floors',{floors:changed.map(r=>({category_id:r.category_id,floor_pct:r.parsed}))});
      setStored(next.floors);
      setText(Object.fromEntries(next.floors.map(f=>[f.category_id,floorInput(f.margin_floor)])));
      setSaved(true);
    }catch(e){
      const fields=e instanceof RequestError&&Array.isArray(e.body?.fields)?e.body.fields as {category_id:string;floor:number}[]:null;
      // A floor raised meanwhile: its row shows the floor in force, in red (C_RS3).
      if(fields?.length)setFloors(current=>new Map([...current,...fields.map(f=>[f.category_id,f.floor] as const)]));
      else setError(e instanceof Error?e.message:'Your margins weren’t saved. Try again.');
    }finally{setSaving(false);}
  }

  return <SettingsFrame tabs={tabs}>
    <Card title="Your margins" saved={saved} action={<SaveButton label="Save margins" drawnOff disabled={invalid||anyBelow||saving} onClick={()=>void save()}/>}>
      <Problem>{error||(invalid?MARGIN_PROBLEM:'')}</Problem>
      <div role="table" aria-label="Your margins">
        <div role="row" className={`${s.head} ${s.marginGrid}`}>
          <div role="columnheader">:: Category</div>
          <div role="columnheader" className={s.scale}><span>0%</span><span>25%</span><span>50%</span></div>
          <div role="columnheader">:: Your margin</div>
          <div role="columnheader">:: Organization floor</div>
        </div>
        {rows.map(r=>{
          const noteId=`margin-below-${r.category_id}`;
          const at=floorPosition(r.parsed===null?r.margin_floor:r.parsed/100);
          return <div key={r.category_id} role="row" className={`${s.gridRow} ${s.marginGrid}`}>
            <div role="rowheader" className={s.floorName}>{r.category_name}</div>
            <div role="cell" className={s.track} aria-hidden="true">
              <div className={cx(s.fill,r.below&&s.fillBelow)} style={{width:at}}/>
              <div className={cx(s.tick,s.tickFloor)} style={{left:floorPosition(r.floor)}}/>
              <div className={cx(s.tick,r.below&&s.tickBelow)} style={{left:at}}/>
            </div>
            <div role="cell" className={s.unit}>
              <input id={`margin-${r.category_id}`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} className={cx(s.box,s.w80,r.below&&s.boxBelow)}
                aria-label={`${r.category_name} margin`} aria-invalid={r.parsed===null||r.below||undefined} aria-describedby={r.below?noteId:undefined}
                value={text[r.category_id]??''} onChange={e=>{const value=e.target.value;setText(t=>({...t,[r.category_id]:value}));setSaved(false);setError('');}}/>
              <span className={s.unitText} aria-hidden="true">%</span>
            </div>
            <div role="cell" className={s.orgFloor}>{floorLabel(r.floor)}</div>
            {r.below&&<div id={noteId} className={s.belowNote}>{belowFloor(floorLabel(r.floor))}</div>}
          </div>;
        })}
      </div>
      <div className={s.legend}>
        <span><span className={cx(s.swatch,s.swatchFloor)}/>Organization floor, set by your manager</span>
        <span><span className={s.swatch}/>Your margin</span>
      </div>
    </Card>
  </SettingsFrame>;
}
