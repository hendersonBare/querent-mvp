'use client';
import {useState} from 'react';
import {labels,type API,type AccessRule,type Rep} from '@/lib/contracts';
export function RepAssignments({api,scope,rules,reps,refresh}:{api:API;scope:string;rules:AccessRule[];reps:Rep[];refresh:()=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function assign(category:string,value:string){setBusy(true);setError('');try{await api.send(`supplier/assignments/${scope}/${category}`,'PUT',{rep_id:value||null});await refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
 return <section className="card"><div className="section-heading"><div><h2>Rep assignments</h2><p>A familiar contact for every question.</p></div></div>{error&&<p className="error" role="alert">{error}</p>}{rules.map(r=><div className="settings-row" key={r.category}><label htmlFor={`rep-${r.category}`}>{labels[r.category]}</label><select id={`rep-${r.category}`} disabled={busy} value={r.mixed_rep?'mixed':r.rep_id||''} onChange={e=>void assign(r.category,e.target.value)}>{r.mixed_rep&&<option value="mixed" disabled>Mixed</option>}<option value="">Self-serve</option>{reps.map(rep=><option value={rep.id} key={rep.id}>{rep.name}</option>)}</select></div>)}</section>;
}
