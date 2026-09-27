'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {AssignmentRow,SettingsRep} from '@/server/rep/settings';
import {repPageStyles as page} from '../RepPage';
import {saveSetting} from './api';
import {quotesByRep,reassignedNote} from './format';
import s from './Settings.module.css';

// Settings > Rep assignments (spec §4): one rep per customer, placeholders included. Any rep can
// change it (the demo has one supplier login; flagged for review). A customer's existing quotes
// stay with the rep they were requested for; the Quotes column shows them by rep.

export function RepAssignments({rows,reps,repId,onChange}:{rows:AssignmentRow[];reps:SettingsRep[];
  /** The signed-in rep, marked "(you)" in each dropdown. */
  repId:string;onChange:(rows:AssignmentRow[])=>void}){
  const router=useRouter();
  const [pending,setPending]=useState<string|null>(null);
  const [notice,setNotice]=useState(''),[error,setError]=useState('');

  async function assign(row:AssignmentRow,newRep:string){
    setPending(row.id);setError('');setNotice('');
    try{
      const {assignments}=await saveSetting<{assignments:AssignmentRow[]}>('assignments',{customer_id:row.id,rep_id:newRep});
      onChange(assignments);
      const updated=assignments.find(a=>a.id===row.id);
      if(updated)setNotice(reassignedNote(updated));
      // The header's "Viewing" picker shows each customer's rep: re-read it.
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    finally{setPending(null);}
  }

  return <section className={`${page.card} ${s.card}`} aria-labelledby="settings-assignments">
    <div className={s.head}>
      <h2 id="settings-assignments">Rep assignments</h2>
      <p>Each customer has one rep. New quote requests, the rep card in the customer’s chat and chat’s “call your rep” go to this rep. Quotes already requested stay with their rep.</p>
    </div>
    {error&&<p className={s.error} role="alert">{error}</p>}
    <p className={s.notice} role="status">{notice}</p>
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
            <select className={s.select} aria-label={`Rep for ${row.name}`} value={row.rep_id??''} disabled={pending!==null}
              onChange={event=>void assign(row,event.target.value)}>
              {row.rep_id===null&&<option value="" disabled>Choose a rep</option>}
              {reps.map(rep=><option key={rep.id} value={rep.id}>{rep.name}{rep.id===repId?' (you)':''}</option>)}
            </select>
          </td>
          <td className={s.quotes}><span className={s.cellWord}>Quotes: </span>{quotesByRep(row.quotes)}</td>
        </tr>)}
      </tbody>
    </table>
  </section>;
}
