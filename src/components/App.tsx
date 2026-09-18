'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,Building2,HardHat} from 'lucide-react';
import {createAPI} from '@/lib/api';
import type {Principal,Persona} from '@/lib/contracts';
import {CustomerChat} from '@/features/chat/Chat';
import {SupplierDashboard} from './SupplierDashboard';
const choices:Persona[]=[{id:'supplier',label:'Century Equipment',description:'Open the supplier administration console.'},{id:'wasatch',label:'Wasatch Excavation',description:'Ask questions as the primary demo customer.'},{id:'bonneville',label:'Bonneville Grading',description:'Explore the second customer workspace.'}];
export function App(){
 const [user,setUser]=useState<Principal|null>(null),[ready,setReady]=useState(false),[error,setError]=useState('');
 const switchWorkspace=useCallback(async()=>{await fetch('/api/session',{method:'DELETE'});setUser(null);setError('');},[]);
 const api=useMemo(()=>createAPI(()=>void switchWorkspace()),[switchWorkspace]);
 useEffect(()=>{fetch('/api/session',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Unable to open the demo.');return r.json();}).then(setUser).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);
 async function choose(persona:Persona['id']){setError('');const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona})});const result=await response.json();if(!response.ok){setError(result.detail);return;}setUser(result);}
 if(!ready)return <main className="setup-state" role="status"><img src="/querent-logo.png" alt="" width="55" height="55"/><p>Opening the demo…</p></main>;
 if(!user)return <main className="login-page"><section className="login-story"><div className="wordmark"><img src="/querent-logo.png" alt="" width="42" height="42"/>Querent</div><div><p className="eyebrow">FICTIONAL PRODUCT DEMO</p><h1>Customer data,<br/>finally<br/><span>customer-facing.</span></h1><p>Choose a workspace to explore the complete demo.<br/>No account or password is required.</p></div><span className="login-footer">All people, companies, and records shown are fictional.</span></section><section className="login-form-wrap"><div className="login-form persona-form"><p className="eyebrow">DEMO WORKSPACES</p><h2>Who would you like to explore as?</h2>{choices.map((choice,index)=><button className="persona-choice" key={choice.id} onClick={()=>void choose(choice.id)}>{index===0?<Building2/>:<HardHat/>}<span><strong>{choice.label}</strong><small>{choice.description}</small></span><ArrowRight size={18}/></button>)}{error&&<p role="alert" className="error">{error}</p>}<p className="login-help">This open demo is not an authentication system.</p></div></section></main>;
 return user.role==='supplier_admin'?<SupplierDashboard api={api} signOut={()=>void switchWorkspace()}/>:<CustomerChat api={api} user={user} signOut={()=>void switchWorkspace()}/>;
}
