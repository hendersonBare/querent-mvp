'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,Building2,HardHat,UserRound} from 'lucide-react';
import {createAPI} from '@/lib/api';
import type {Principal,Persona,RepPersona} from '@/lib/contracts';
import {CustomerChat} from '@/features/chat/Chat';
import {OpenRepPortal} from './rep/OpenRepPortal';
// The demo workspaces (spec §2; v3 decision 39, spec §6 Workspace chooser, OA-27; task F1): Herrick as
// Brandi, the manager; the Herrick rep personas the server offers (Mara and Eli while active), each
// with its role; and Wasatch as Dana. Rep buttons never name Herrick, so "Herrick Industrial Supply" is Brandi's alone.
const [supplier,customer]:Persona[]=[{id:'supplier',label:'Herrick Industrial Supply',description:'Supplier. Brandi Gallegos · Manager: every rep’s quotes and the Team dashboard.'},{id:'customer',label:'Wasatch Mechanical Contractors',description:'Customer. Dana Ortiz, Purchasing, account WAS-1142.'}];
const roleLabel=(r:RepPersona)=>`${r.role==='manager'?'Manager':'Rep'}${r.team?` · ${r.team}`:''}`;
export function App(){
 const [user,setUser]=useState<Principal|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[reps,setReps]=useState<RepPersona[]>([]);
 const switchWorkspace=useCallback(async()=>{await fetch('/api/session',{method:'DELETE'});setUser(null);setError('');},[]);
 const api=useMemo(()=>createAPI(()=>void switchWorkspace()),[switchWorkspace]);
 useEffect(()=>{fetch('/api/session',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Unable to open the demo.');return r.json();}).then(setUser).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);
 // The rep personas, read again each time the chooser shows, so a rep marked inactive since drops out.
 useEffect(()=>{if(user)return;let live=true;fetch('/api/session/personas',{cache:'no-store'}).then(r=>r.ok?r.json():{reps:[]}).then((b:{reps?:RepPersona[]})=>{if(live)setReps(b.reps??[]);}).catch(()=>{if(live)setReps([]);});return()=>{live=false;};},[user]);
 async function choose(persona:Persona['id']){setError('');const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona})});const result=await response.json();if(!response.ok){setError(result.detail);return;}setUser(result);}
 if(!ready)return <main className="setup-state" role="status"><img src="/querent-logo.png" alt="" width="55" height="55"/><p>Opening the demo…</p></main>;
 if(!user)return <main className="login-page"><section className="login-story"><div className="wordmark"><img src="/querent-logo.png" alt="" width="42" height="42"/>Querent</div><div><p className="eyebrow">FICTIONAL PRODUCT DEMO</p><h1>Customer data,<br/>finally<br/><span>customer-facing.</span></h1><p>Choose a workspace to explore the complete demo.<br/>No account or password is required.</p></div><span className="login-footer">All people, companies, and records shown are fictional.</span></section><section className="login-form-wrap"><div className="login-form persona-form"><p className="eyebrow">DEMO WORKSPACES</p><h2>Who would you like to explore as?</h2><button className="persona-choice" onClick={()=>void choose(supplier.id)}><Building2/><span><strong>{supplier.label}</strong><small>{supplier.description}</small></span><ArrowRight size={18}/></button>{reps.length>0&&<div className="persona-reps" role="group" aria-label="Herrick reps"><p className="persona-reps-label" aria-hidden="true">Or a Herrick rep</p>{reps.map(r=><button className="persona-choice persona-rep" key={r.id} onClick={()=>void choose(r.id)}><UserRound/><span><strong>{r.name}</strong><small>{roleLabel(r)}</small></span><ArrowRight size={16}/></button>)}</div>}<button className="persona-choice" onClick={()=>void choose(customer.id)}><HardHat/><span><strong>{customer.label}</strong><small>{customer.description}</small></span><ArrowRight size={18}/></button>{error&&<p role="alert" className="error">{error}</p>}<p className="login-help">This open demo is not an authentication system.</p></div></section></main>;
 return user.role==='supplier_admin'?<OpenRepPortal/>:<CustomerChat api={api} user={user} signOut={()=>void switchWorkspace()}/>;
}
