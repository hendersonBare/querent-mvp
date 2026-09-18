'use client';
import {useEffect,useState} from 'react';
import type {API,AccessRule,Category} from '@/lib/contracts';
import {labels} from '@/lib/contracts';
export function AccessSwitches({api,scope,rules,refresh}:{api:API;scope:string;rules:AccessRule[];refresh:()=>void}){
 const [local,setLocal]=useState(rules),[pending,setPending]=useState<Category|null>(null),[error,setError]=useState('');
 useEffect(()=>{setLocal(rules);},[rules]);
 async function toggle(rule:AccessRule){setPending(rule.category);setError('');try{await api.send(`supplier/access/${scope}/${rule.category}`,'PUT',{enabled:rule.enabled!==true});setLocal(current=>current.map(r=>r.category===rule.category?{...r,enabled:rule.enabled!==true}:r));refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setPending(null);}}
 return <section className="card"><div className="section-heading"><div><h2>Customer access</h2><p>Choose what customers can ask about.</p></div><span className="eyebrow">SAVED AUTOMATICALLY</span></div>{error&&<p role="alert" className="error">{error}</p>}<div className="settings-list">{local.map(rule=><div className="settings-row" key={rule.category}><div><span>{labels[rule.category]}</span><small>{rule.enabled===null?'Mixed across customers':rule.enabled?'Available to customers':'Hidden from customers'}</small></div><button className={`switch ${rule.enabled===true?'on':rule.enabled===null?'mixed':''}`} role="switch" aria-checked={rule.enabled===null?'mixed':rule.enabled} aria-label={labels[rule.category]} disabled={pending!==null} onClick={()=>void toggle(rule)}><span/></button></div>)}</div></section>;
}
