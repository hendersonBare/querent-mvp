'use client';
import {useId,useMemo,useState,type KeyboardEvent,type ReactNode} from 'react';
import {Icon} from '@/components/ui/Icon';
import {cx} from '@/components/ui/cx';
import type {OrgFloorCell,RepFloorSet} from '@/server/rep/settings';
import {saveSetting} from './api';
import {firstName,floorInput,floorPosition,parseFloorPct} from './format';
import {Card,GridHead,Problem,SaveButton,SettingsFrame} from './parts';
import s from './Settings.module.css';

// Settings > Margin floors (plan U8; C_S2, C_S3), the manager's:
//   - Organization margin floors: one floor per product category, the hard stop reps cannot go below
//     (Appendix C org_margin_floors), all saved together through PUT /api/rep/settings/org-floors.
//   - Rep margins: a read-only review of one rep's own margin per category against the organization
//     floor, the rep picked in a searchable box (every rep by name; the first one shown is the first rep who
//     is not the signed-in manager, as C_S2 shows Eli). Managers do not set floors here for themselves.
// A rep gets MyFloors instead: their own floors in the same card, until their own tabs come (plan U9).
// Floors are shown and stored to 0.1 point, the precision the red warnings compare at. No frame: the
// "Saved" line beside Save and the one red line for a floor that is not one (decision 52).

const FLOOR_PROBLEM='Enter a floor from 0 to 99.9.';

export function MarginFloors({orgFloors,repMargins,meId,tabs}:{orgFloors:OrgFloorCell[];repMargins:RepFloorSet[];meId:string;tabs:ReactNode}){
  const [floors,setFloors]=useState(orgFloors);
  return <SettingsFrame tabs={tabs}>
    <OrgFloors floors={floors} onSaved={setFloors}/>
    <RepMargins reps={repMargins} floors={floors} meId={meId}/>
  </SettingsFrame>;
}

/** Floor fields' text, what they read as, and whether any changed or is not a floor. */
function useFloorFields(stored:{category_id:string;floor:number}[]){
  const [text,setText]=useState(()=>Object.fromEntries(stored.map(f=>[f.category_id,floorInput(f.floor)])) as Record<string,string>);
  const parsed=Object.fromEntries(stored.map(f=>[f.category_id,parseFloorPct(text[f.category_id]??'')]));
  const invalid=stored.some(f=>parsed[f.category_id]===null);
  const changed=stored.filter(f=>parsed[f.category_id]!==null&&parsed[f.category_id]!==Number(floorInput(f.floor)));
  const reset=(next:{category_id:string;floor:number}[])=>setText(Object.fromEntries(next.map(f=>[f.category_id,floorInput(f.floor)])));
  return {text,setText,parsed,invalid,changed,reset};
}

/** One category's row: name, the 0% to 50% bar with the floor's tick, the field and "%" (C_S2). */
function FloorRow({categoryId,name,value,parsed,fallback,onChange}:{categoryId:string;name:string;value:string;parsed:number|null;fallback:number;onChange:(value:string)=>void}){
  const at=floorPosition(parsed===null?fallback:parsed/100);
  return <div role="row" className={`${s.gridRow} ${s.floorGrid}`}>
    <div role="rowheader" className={s.floorName}>{name}</div>
    <div role="cell" className={s.track} aria-hidden="true"><div className={s.fill} style={{width:at}}/><div className={s.tick} style={{left:at}}/></div>
    <div role="cell" className={s.unit}>
      <input id={`floor-${categoryId}`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} className={cx(s.box,s.w80)} aria-label={`${name} floor`}
        aria-invalid={parsed===null||undefined} value={value} onChange={e=>onChange(e.target.value)}/>
      <span className={s.unitText} aria-hidden="true">%</span>
    </div>
  </div>;
}

/** The floors table: the header (category, the bar's scale, floor) and one row per category. */
function FloorTable({label,rows}:{label:string;rows:ReactNode}){
  return <div role="table" aria-label={label}>
    <div role="row" className={`${s.head} ${s.floorGrid}`}>
      <div role="columnheader">:: Category</div>
      <div role="columnheader" className={s.scale}><span>0%</span><span>25%</span><span>50%</span></div>
      <div role="columnheader">:: Floor</div>
    </div>
    {rows}
  </div>;
}

function OrgFloors({floors,onSaved}:{floors:OrgFloorCell[];onSaved:(floors:OrgFloorCell[])=>void}){
  const fields=useFloorFields(floors);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  async function save(){
    if(fields.invalid||saving)return;
    if(!fields.changed.length){setSaved(false);return;}
    setSaving(true);setError('');setSaved(false);
    try{
      const next=await saveSetting<OrgFloorCell[]>('org-floors',{floors:floors.map(f=>({category_id:f.category_id,floor_pct:fields.parsed[f.category_id]}))});
      onSaved(next);fields.reset(next);setSaved(true);
    }catch(e){setError(e instanceof Error?e.message:'The floors weren’t saved. Try again.');}
    finally{setSaving(false);}
  }
  return <Card title="Organization margin floors" saved={saved} action={<SaveButton label="Save floors" disabled={fields.invalid||saving} onClick={()=>void save()}/>}>
    <Problem>{error||(fields.invalid?FLOOR_PROBLEM:'')}</Problem>
    <FloorTable label="Organization margin floors" rows={floors.map(f=><FloorRow key={f.category_id} categoryId={f.category_id} name={f.category_name} value={fields.text[f.category_id]??''}
      parsed={fields.parsed[f.category_id]} fallback={f.floor} onChange={v=>{fields.setText(t=>({...t,[f.category_id]:v}));setSaved(false);setError('');}}/>)}/>
  </Card>;
}

/** C_S2, C_S3: one rep's margins, read-only, against the organization floors. */
function RepMargins({reps,floors,meId}:{reps:RepFloorSet[];floors:OrgFloorCell[];meId:string}){
  const [repId,setRepId]=useState(()=>(reps.find(r=>r.rep.id!==meId)??reps[0])?.rep.id);
  const rep=reps.find(r=>r.rep.id===repId);
  const listId=useId();
  const [open,setOpen]=useState(false),[typed,setTyped]=useState<string|null>(null),[active,setActive]=useState(0);
  const shown=useMemo(()=>{
    const q=typed?.trim().toLowerCase()??'';
    return q?reps.filter(r=>r.rep.name.toLowerCase().includes(q)):reps;
  },[reps,typed]);
  const openList=()=>{setActive(Math.max(0,shown.findIndex(r=>r.rep.id===repId)));setOpen(true);};
  const pick=(id:string)=>{setRepId(id);setTyped(null);setOpen(false);};
  function key(event:KeyboardEvent){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      if(!open){openList();return;}
      setActive(a=>Math.min(shown.length-1,Math.max(0,a+(event.key==='ArrowDown'?1:-1))));
    }else if(event.key==='Enter'&&open&&shown[active]){event.preventDefault();pick(shown[active].rep.id);}
    else if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);setTyped(null);}
  }
  const floorOf=(categoryId:string)=>floors.find(f=>f.category_id===categoryId);
  return <Card title="Rep margins" note="Read-only. Each rep sets their own above your floors." review>
    <div className={s.reviewPick}>
      <div className={s.repSearch}>
        <div className={s.repBox}>
          <Icon name="search" size={16}/>
          <input role="combobox" aria-label="Rep" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" spellCheck={false}
            aria-activedescendant={open&&shown[active]?`${listId}-${shown[active].rep.id}`:undefined}
            className={s.repInput} value={typed??rep?.rep.name??''} onClick={()=>open?setOpen(false):openList()} onKeyDown={key}
            onChange={e=>{setTyped(e.target.value);setActive(0);setOpen(true);}} onBlur={()=>{setOpen(false);setTyped(null);}}/>
        </div>
        {open&&<div id={listId} role="listbox" aria-label="Reps" className={s.repList}>
          {shown.map((r,i)=><div key={r.rep.id} id={`${listId}-${r.rep.id}`} role="option" aria-selected={r.rep.id===repId}
            className={cx(s.repOption,i===active&&s.repActive)} onMouseEnter={()=>setActive(i)} onMouseDown={e=>{e.preventDefault();pick(r.rep.id);}}>{r.rep.name}</div>)}
          {!shown.length&&<div className={s.repOption}>No reps match.</div>}
        </div>}
      </div>
    </div>
    {rep&&<div role="table" aria-label={`${rep.rep.name}’s margins`}>
      <GridHead className={s.reviewGrid} labels={['Category',firstName(rep.rep.name),'Organization floor']} right={[1,2]}/>
      {rep.floors.map(f=><div key={f.category_id} role="row" className={`${s.reviewRow} ${s.reviewGrid}`}>
        <div role="rowheader" className={s.reviewCategory}>{f.category_name}</div>
        <div role="cell" className={s.reviewMargin}>{f.label}</div>
        <div role="cell" className={s.reviewFloor}>{floorOf(f.category_id)?.label??'0.0%'}</div>
      </div>)}
    </div>}
  </Card>;
}

/**
 * A rep's own margin floors (spec §5.2), in the Organization margin floors card's look, until plan U9's
 * rep tabs. Save sends each changed floor through PUT /api/rep/settings/floors, which refuses anyone else's.
 */
export function MyFloors({mine,tabs}:{mine:RepFloorSet;tabs:ReactNode}){
  const [floors,setFloors]=useState(mine.floors);
  const stored=floors.map(f=>({category_id:f.category_id,floor:f.margin_floor}));
  const fields=useFloorFields(stored);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  async function save(){
    if(fields.invalid||saving||!fields.changed.length)return;
    setSaving(true);setError('');setSaved(false);
    try{
      let next=floors;
      for(const f of fields.changed)next=(await saveSetting<RepFloorSet>('floors',{category_id:f.category_id,floor_pct:fields.parsed[f.category_id]})).floors;
      setFloors(next);fields.reset(next.map(f=>({category_id:f.category_id,floor:f.margin_floor})));setSaved(true);
    }catch(e){setError(e instanceof Error?e.message:'The floors weren’t saved. Try again.');}
    finally{setSaving(false);}
  }
  return <SettingsFrame tabs={tabs}>
    <Card title="My margin floors" saved={saved} action={<SaveButton label="Save floors" disabled={fields.invalid||saving} onClick={()=>void save()}/>}>
      <Problem>{error||(fields.invalid?FLOOR_PROBLEM:'')}</Problem>
      <FloorTable label="My margin floors" rows={floors.map(f=><FloorRow key={f.category_id} categoryId={f.category_id} name={f.category_name} value={fields.text[f.category_id]??''}
        parsed={fields.parsed[f.category_id]} fallback={f.margin_floor} onChange={v=>{fields.setText(t=>({...t,[f.category_id]:v}));setSaved(false);setError('');}}/>)}/>
    </Card>
  </SettingsFrame>;
}
