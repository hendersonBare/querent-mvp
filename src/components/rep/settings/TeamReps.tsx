'use client';
import {useId,useState,type FormEvent} from 'react';
import type {TeamRep} from '@/domain';
import {repPageStyles as page} from '../RepPage';
import {saveTeamRep} from './api';
import {Switch} from './Switch';
import s from './Settings.module.css';

// Settings > Reps (v3 spec §6, §8; decisions 20, 21; task D1), manager only: each rep's role, team
// label (a free-text filter) and whether they are active. A rep can be marked inactive only once
// none of the customers are theirs (Rep assignments), and never by themselves; the server refuses
// both too (409 has_customers). Inactive reps can't sign in or be given customers.

/** Most a team label can hold (the server's TEAM_LABEL_MAX). */
const TEAM_MAX=40;
const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;

export function TeamReps({reps,repId,onChange}:{reps:TeamRep[];
  /** The signed-in manager, marked "(you)", who can't mark themselves inactive. */
  repId:string;onChange:(reps:TeamRep[])=>void}){
  const [pending,setPending]=useState<string|null>(null),[error,setError]=useState('');

  async function toggle(rep:TeamRep){
    setPending(rep.id);setError('');
    try{onChange((await saveTeamRep(rep.id,{active:!rep.active})).reps);}
    catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setPending(null);}
  }

  return <section className={`${page.card} ${s.card}`} aria-labelledby="settings-reps">
    <div className={s.head}>
      <h2 id="settings-reps">Reps</h2>
      <p>The team label groups reps for filtering. To mark a rep inactive, first move their customers to another rep in Rep assignments. Inactive reps can’t sign in or be given customers, and their quotes stay in reports.</p>
    </div>
    {error&&<p className={s.error} role="alert">{error}</p>}
    <table className={`${s.table} ${s.stack}`}>
      <caption className={s.srOnly}>Each rep’s role, team label, customers and whether they are active</caption>
      <thead>
        <tr><th scope="col">Rep</th><th scope="col">Role</th><th scope="col">Team</th><th scope="col" className={s.num}>Customers</th><th scope="col">Active</th></tr>
      </thead>
      <tbody>
        {reps.map(rep=><RepRow key={rep.id} rep={rep} me={rep.id===repId} busy={pending!==null} onChange={onChange} onError={setError} onToggle={()=>void toggle(rep)}/>)}
      </tbody>
    </table>
  </section>;
}

function RepRow({rep,me,busy,onChange,onError,onToggle}:{rep:TeamRep;me:boolean;busy:boolean;onChange:(reps:TeamRep[])=>void;onError:(message:string)=>void;onToggle:()=>void}){
  const id=useId();
  const [text,setText]=useState(rep.team??''),[seen,setSeen]=useState(rep.team);
  if(rep.team!==seen){setSeen(rep.team);setText(rep.team??'');}
  const [saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
  const changed=(text.trim()||null)!==rep.team;

  async function save(event:FormEvent){
    event.preventDefault();
    if(!changed||saving)return;
    setSaving(true);setSaved(false);onError('');
    try{onChange((await saveTeamRep(rep.id,{team:text.trim()?text:null})).reps);setSaved(true);}
    catch(e){onError(e instanceof Error?e.message:'That team label wasn’t saved. Try again.');}
    finally{setSaving(false);}
  }

  const blocked=me?'You can’t mark yourself inactive':rep.active&&rep.customer_count>0?`Reassign ${plural(rep.customer_count,'customer')} in Rep assignments first`:'';
  const state=blocked||(rep.active?'Active':'Inactive');
  return <tr data-inactive={rep.active?undefined:true}>
    <th scope="row">
      <span className={s.name}>{rep.name}{me?' (you)':''}</span>
      <span className={s.sub}>{rep.title}</span>
    </th>
    <td><span className={s.cellWord}>Role: </span><span className={s.tag} data-role={rep.role}>{rep.role==='manager'?'Manager':'Rep'}</span></td>
    <td>
      <form className={s.teamForm} onSubmit={event=>void save(event)}>
        <input type="text" autoComplete="off" maxLength={TEAM_MAX} value={text} placeholder="No team" disabled={saving}
          aria-label={`Team label for ${rep.name}`} onChange={event=>{setText(event.target.value);setSaved(false);}}/>
        <button type="submit" className={s.save} disabled={!changed||saving}>{saving?'Saving…':'Save'}</button>
        <span className={s.floorNote} role="status" data-tone="ok">{saved&&!changed?'Saved':''}</span>
      </form>
    </td>
    <td className={s.num}><span className={s.cellWord}>Customers: </span>{rep.customer_count}</td>
    <td>
      <span className={s.activeCell}>
        <Switch checked={rep.active} label={`${rep.name} active`} describedBy={`${id}-state`} disabled={busy||saving||Boolean(blocked)} onToggle={onToggle}/>
        <span className={s.state} id={`${id}-state`} data-state={rep.active?'on':'off'}>{state}</span>
      </span>
    </td>
  </tr>;
}
