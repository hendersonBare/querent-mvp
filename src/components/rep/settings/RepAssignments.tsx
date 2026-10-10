'use client';
import {useId,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ReassignResult} from '@/server/rep/reassign';
import type {AssignmentRow,SettingsRep} from '@/server/rep/settings';
import {repPageStyles as page} from '../RepPage';
import {saveSetting} from './api';
import {quotesByRep,reassignedNote} from './format';
import s from './Settings.module.css';

// Settings > Rep assignments (spec §4): one rep per customer, placeholders included. The manager
// changes them (decision 21, OA-55, task D2); a rep sees them read-only. A customer's existing
// quotes stay with their rep unless the manager ticks "Also move this customer's open quotes":
// then the open ones (drafts, change requests, unexpired sent quotes) move with the customer, each
// with an Activity entry. The Quotes column shows the customer's quotes by rep.

export function RepAssignments({rows,reps,repId,manager,onChange}:{rows:AssignmentRow[];reps:SettingsRep[];
  /** The signed-in rep, marked "(you)". */
  repId:string;
  /** Only the manager can change assignments; a rep gets the table without dropdowns. */
  manager:boolean;
  onChange:(rows:AssignmentRow[])=>void}){
  const router=useRouter();
  const moveId=useId();
  const [pending,setPending]=useState<string|null>(null);
  const [moveOpen,setMoveOpen]=useState(false);
  const [notice,setNotice]=useState(''),[error,setError]=useState('');

  async function assign(row:AssignmentRow,newRep:string){
    setPending(row.id);setError('');setNotice('');
    try{
      const {assignments,moved}=await saveSetting<{assignments:AssignmentRow[];moved?:ReassignResult|null}>('assignments',
        {customer_id:row.id,rep_id:newRep,...(moveOpen?{moveOpenQuotes:true}:{})});
      onChange(assignments);
      const updated=assignments.find(a=>a.id===row.id);
      if(updated)setNotice(reassignedNote(updated,moved?moved.moved.length:null));
      // The header's "Viewing" picker shows each customer's rep: re-read it.
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setPending(null);}
  }

  return <section className={`${page.card} ${s.card}`} aria-labelledby="settings-assignments">
    <div className={s.head}>
      <h2 id="settings-assignments">Rep assignments</h2>
      <p>Each customer has one rep. New quote requests, the rep card in the customer’s chat and chat’s “call your rep” go to this rep. Quotes already requested stay with their rep{manager?' unless you also move the open ones':''}.</p>
    </div>
    {manager
      ?<div className={s.moveOpen}>
        <input id={moveId} type="checkbox" checked={moveOpen} disabled={pending!==null} onChange={event=>setMoveOpen(event.target.checked)}/>
        <label htmlFor={moveId}>Also move this customer’s open quotes</label>
        <span className={s.sub}>Drafts, change requests and sent quotes that haven’t expired go to the new rep, each with an Activity entry.</span>
      </div>
      :<p className={s.notice}>Only a manager can change rep assignments.</p>}
    {error&&<p className={s.error} role="alert">{error}</p>}
    {manager&&<p className={s.notice} role="status">{notice}</p>}
    <table className={`${s.table} ${s.stack}`}>
      <caption className={s.srOnly}>Each customer’s assigned rep</caption>
      <thead>
        <tr><th scope="col">Customer</th><th scope="col">Rep</th><th scope="col">Quotes</th></tr>
      </thead>
      <tbody>
        {rows.map(row=><tr key={row.id}>
          <th scope="row">
            <span className={s.name}>{row.name}</span>
            <span className={s.sub}><span className={s.mono}>{row.account_number}</span>{row.placeholder&&<span className={s.tag} title="Name, account number and rep only">Placeholder</span>}</span>
          </th>
          <td>
            {manager
              ?<select className={s.select} aria-label={`Rep for ${row.name}`} value={row.rep_id??''} disabled={pending!==null}
                onChange={event=>void assign(row,event.target.value)}>
                {row.rep_id===null&&<option value="" disabled>Choose a rep</option>}
                {reps.map(rep=><option key={rep.id} value={rep.id}>{rep.name}{rep.id===repId?' (you)':''}</option>)}
              </select>
              :<span className={s.name}>{row.rep_name??'No rep yet'}{row.rep_id!==null&&row.rep_id===repId?' (you)':''}</span>}
          </td>
          <td className={s.quotes}><span className={s.cellWord}>Quotes: </span>{quotesByRep(row.quotes)}</td>
        </tr>)}
      </tbody>
    </table>
  </section>;
}
