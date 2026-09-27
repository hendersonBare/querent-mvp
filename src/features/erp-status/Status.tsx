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
