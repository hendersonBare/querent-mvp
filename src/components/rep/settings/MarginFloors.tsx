'use client';
import {useId,useState,type FormEvent} from 'react';
import {formatFloor} from '@/server/floors';
import type {FloorCell,RepFloorSet} from '@/server/rep/settings';
import {repPageStyles as page} from '../RepPage';
import {saveSetting} from './api';
import {floorInput,floorPosition,parseFloorPct} from './format';
import s from './Settings.module.css';

// Settings > My margin floors (spec §5.2): the signed-in rep's floor per product category, each
// saved through PUT /api/rep/settings/floors (setMyFloor on the server, which refuses anyone
// else's). Floors are shown and stored to 0.1 point, the precision the red warnings compare at.
// Other reps' floors are read-only: each rep sets their own, and only Brandi can sign in.

const firstName=(name:string)=>name.trim().split(/\s+/)[0]||name;

export function MarginFloors({mine,others,onSaved}:{mine:RepFloorSet;others:RepFloorSet[];onSaved:(floors:RepFloorSet)=>void}){
  const me=firstName(mine.rep.name);
  const example=mine.floors.find(f=>f.category_id==='safety')??mine.floors[0];
  return <>
    <section className={`${page.card} ${s.card}`} aria-labelledby="settings-my-floors">
      <div className={s.head}>
        <h2 id="settings-my-floors">My margin floors</h2>
        <p>A quote line priced under your floor for its category gets a red warning{example&&<>, like “Below {me}’s {formatFloor(example.margin_floor)} {example.category_name} floor”</>}. Warnings never block sending. Your quotes use these as soon as you save.</p>
      </div>
      <div className={s.floorHead} aria-hidden="true">
        <span>Category</span>
        <span className={s.scale}><span>0%</span><span>25%</span><span>50%</span></span>
        <span>Floor</span>
      </div>
      <ul className={s.floors}>
        {mine.floors.map(floor=><FloorRow key={floor.category_id} repId={mine.rep.id} floor={floor} onSaved={onSaved}/>)}
      </ul>
    </section>
    {others.length>0&&<section className={`${page.card} ${s.card}`} aria-labelledby="settings-other-floors">
      <div className={s.head}>
        <h2 id="settings-other-floors">Other reps’ floors</h2>
        <p>Read-only. Each rep sets their own, and their quotes are checked against them.</p>
      </div>
      <div className={s.scroll}>
        <table className={`${s.table} ${s.matrix}`}>
          <caption className={s.srOnly}>Margin floors of the other reps, by product category</caption>
          <thead>
            <tr><th scope="col">Category</th>{others.map(o=><th key={o.rep.id} scope="col" className={s.num} title={o.rep.name}>{firstName(o.rep.name)}<span className={s.srOnly}> {o.rep.name.split(/\s+/).slice(1).join(' ')}</span></th>)}</tr>
          </thead>
          <tbody>
            {(others[0]?.floors??[]).map(({category_id,category_name})=><tr key={category_id}>
              <th scope="row">{category_name}</th>
              {others.map(o=><td key={o.rep.id} className={s.num}>{o.floors.find(f=>f.category_id===category_id)?.label??'—'}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
  </>;
}

function FloorRow({repId,floor,onSaved}:{repId:string;floor:FloorCell;onSaved:(floors:RepFloorSet)=>void}){
  const id=useId();
  const [text,setText]=useState(()=>floorInput(floor.margin_floor));
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  // The floor as last stored: the prop, or what the server returned for this row's save.
  const [stored,setStored]=useState(floor.margin_floor),[seen,setSeen]=useState(floor.margin_floor);
  if(floor.margin_floor!==seen){setSeen(floor.margin_floor);setStored(floor.margin_floor);}
  const pct=parseFloorPct(text);
  const current=Number(floorInput(stored));
  const invalid=pct===null;
  const changed=!invalid&&pct!==current;

  async function save(event:FormEvent){
    event.preventDefault();
    if(invalid||!changed||saving)return;
    setSaving(true);setError('');setSaved(false);
    try{
      const floors=await saveSetting<RepFloorSet>('floors',{rep_id:repId,category_id:floor.category_id,floor_pct:pct});
      const row=floors.floors.find(f=>f.category_id===floor.category_id);
      if(row){setStored(row.margin_floor);setText(floorInput(row.margin_floor));}
      onSaved(floors);setSaved(true);
    }catch(e){setError(e instanceof Error?e.message:'That floor wasn’t saved. Try again.');}
    finally{setSaving(false);}
  }

  const fieldId=`${id}-floor`,noteId=`${id}-note`;
  const note=error||(invalid?'Enter a floor from 0 to 99.9.':saved&&!changed?'Saved':'');
  return <li className={s.floor}>
    <form className={s.floorForm} onSubmit={event=>void save(event)}>
      <label className={s.name} htmlFor={fieldId}>{floor.category_name}</label>
      <span className={s.track} aria-hidden="true">
        <i style={{width:floorPosition(invalid?stored:pct/100)}}/>
        <u style={{left:floorPosition(invalid?stored:pct/100)}}/>
      </span>
      <span className={s.field} data-invalid={invalid||undefined}>
        <input id={fieldId} type="text" inputMode="decimal" autoComplete="off" value={text} aria-invalid={invalid||undefined} aria-describedby={noteId}
          aria-label={`${floor.category_name} floor`} onChange={event=>{setText(event.target.value);setSaved(false);setError('');}}/>
        <span aria-hidden="true">%</span>
      </span>
      <button type="submit" className={s.save} disabled={!changed||saving}>{saving?'Saving…':'Save'}</button>
      <span className={s.floorNote} id={noteId} role="status" data-tone={error||invalid?'bad':'ok'}>{note}</span>
    </form>
  </li>;
}
