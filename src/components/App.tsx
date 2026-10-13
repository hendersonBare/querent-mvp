'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,Building2,HardHat,UserRound} from 'lucide-react';
import {createAPI} from '@/lib/api';
import type {Principal,Persona,RepPersona} from '@/lib/contracts';
import {CustomerChat} from '@/features/chat/Chat';
import {VisitorSite} from './customer/site/VisitorSite';
import {OpenRepPortal} from './rep/OpenRepPortal';
// The demo workspaces (spec §2; v3 decision 39, spec §6 Workspace chooser, OA-27; task F1): Herrick as
// Brandi, the manager; the Herrick rep personas the server offers (Mara and Eli while active), each
// with its role; and Wasatch as Dana. Rep buttons never name Herrick, so "Herrick Industrial Supply" is Brandi's alone.
const [supplier,customer]:Persona[]=[{id:'supplier',label:'Herrick Industrial Supply',description:'Supplier. Brandi Gallegos · Manager: every rep’s quotes, Analytics and Teams and Reps.'},{id:'customer',label:'Wasatch Mechanical Contractors',description:'Customer. Dana Ortiz, Purchasing, account WAS-1142.'}];
const roleLabel=(r:RepPersona)=>`${r.role==='manager'?'Manager':'Rep'}${r.team?` · ${r.team}`:''}`;
/**
 * The customer site at / (plan U10; decisions 49 and 53): with no session, the visitor box (C_CVE0);
 * a customer session, the customer's box (C_CVL1); the supplier and rep personas open the rep portal.
 * Signing out (the account chip) returns to the visitor box.
 */
export function App(){
 const [user,setUser]=useState<Principal|null>(null),[ready,setReady]=useState(false),[error,setError]=useState('');
 const signOut=useCallback(async()=>{await fetch('/api/session',{method:'DELETE'});setUser(null);},[]);
 const api=useMemo(()=>createAPI(()=>setUser(null)),[]);
 useEffect(()=>{fetch('/api/session',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Unable to open the demo.');return r.json();}).then(setUser).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);
 if(!ready)return <main className="setup-state" role="status"><img src="/querent-logo.png" alt="" width="55" height="55"/><p>Opening the demo…</p></main>;
 if(error&&!user)return <main className="setup-state" role="alert"><p>{error}</p></main>;
 if(!user)return <VisitorSite/>;
 return user.role==='supplier_admin'?<OpenRepPortal/>:<CustomerChat api={api} user={user} signOut={()=>void signOut()}/>;
}

/**
 * The demo workspace chooser, moved unchanged from / to /demo (decision 53): the visitor box's Sign in
 * opens it. Choosing a workspace starts its session and opens it: the customer site at /, or the rep portal.
 */
export function DemoChooser(){
 const router=useRouter();
 const [chosen,setChosen]=useState<Principal|null>(null),[error,setError]=useState(''),[reps,setReps]=useState<RepPersona[]>([]);
 // The rep personas, read each time the chooser shows, so a rep marked inactive since drops out.
 useEffect(()=>{let live=true;fetch('/api/session/personas',{cache:'no-store'}).then(r=>r.ok?r.json():{reps:[]}).then((b:{reps?:RepPersona[]})=>{if(live)setReps(b.reps??[]);}).catch(()=>{if(live)setReps([]);});return()=>{live=false;};},[]);
 useEffect(()=>{if(chosen&&chosen.role!=='supplier_admin')router.replace('/');},[chosen,router]);
 async function choose(persona:Persona['id']){setError('');const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona})});const result=await response.json();if(!response.ok){setError(result.detail);return;}setChosen(result);}
 if(chosen)return chosen.role==='supplier_admin'?<OpenRepPortal/>:<main className="setup-state" role="status"><img src="/querent-logo.png" alt="" width="55" height="55"/><p>Opening the demo…</p></main>;
 return <main className="login-page"><section className="login-story"><div className="wordmark"><img src="/querent-logo.png" alt="" width="42" height="42"/>Querent</div><div><p className="eyebrow">FICTIONAL PRODUCT DEMO</p><h1>Customer data,<br/>finally<br/><span>customer-facing.</span></h1><p>Choose a workspace to explore the complete demo.<br/>No account or password is required.</p></div><span className="login-footer">All people, companies, and records shown are fictional.</span></section><section className="login-form-wrap"><div className="login-form persona-form"><p className="eyebrow">DEMO WORKSPACES</p><h2>Who would you like to explore as?</h2><button className="persona-choice" onClick={()=>void choose(supplier.id)}><Building2/><span><strong>{supplier.label}</strong><small>{supplier.description}</small></span><ArrowRight size={18}/></button>{reps.length>0&&<div className="persona-reps" role="group" aria-label="Herrick reps"><p className="persona-reps-label" aria-hidden="true">Or a Herrick rep</p>{reps.map(r=><button className="persona-choice persona-rep" key={r.id} onClick={()=>void choose(r.id)}><UserRound/><span><strong>{r.name}</strong><small>{roleLabel(r)}</small></span><ArrowRight size={16}/></button>)}</div>}<button className="persona-choice" onClick={()=>void choose(customer.id)}><HardHat/><span><strong>{customer.label}</strong><small>{customer.description}</small></span><ArrowRight size={18}/></button>{error&&<p role="alert" className="error">{error}</p>}<p className="login-help">This open demo is not an authentication system.</p></div></section></main>;
}
