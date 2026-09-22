'use client';
import {useCallback,useEffect,useState} from 'react';
import type {API,ERPStatus} from '@/lib/contracts';
import {usePoll} from '@/lib/use-poll';
export function StatusIndicator({timestamp,now=Date.now()}:{timestamp:string|null;now?:number}){
 const stale=!timestamp || now-Date.parse(timestamp)>=120000;
 return <div className="status-stack"><span className={`status-pill ${stale?'amber':''}`}><span className="status-dot"/>{stale?'Update delayed':'Connected'}</span><span className="status-time">{timestamp?`Last updated: ${new Date(timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Waiting for first update'}</span></div>;
}
export function ERPIndicator({api}:{api:API}){
 const load=useCallback(()=>api.get<ERPStatus>('erp/status'),[api]);
 const {data}=usePoll(load);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
 return <StatusIndicator timestamp={data?.last_updated??null} now={now}/>;
}
export function DataSources({api}:{api:API}){
 const load=useCallback(()=>api.get<ERPStatus>('erp/status'),[api]);
 const {data,error}=usePoll(load);
 return <section className="card source-card"><div className="section-heading"><div className="source-mark">ERP</div><div><h2>Herrick Industrial Supply ERP</h2><p>Customer records and inventory</p></div><ERPIndicator api={api}/></div>{error&&<p role="alert" className="error">{error}</p>}<div className="card-divider"/><h3>Recent updates</h3><ol className="event-list">{data?.events.map(e=><li key={e.id}><span className="event-dot"/><div>{e.message}<time>{new Date(e.timestamp).toLocaleString()}</time></div></li>)}</ol>{!data?.events.length&&<p className="muted">Waiting for the first connection update.</p>}</section>;
}
