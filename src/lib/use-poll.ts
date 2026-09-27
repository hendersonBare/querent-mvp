'use client';
import {useCallback,useEffect,useRef,useState} from 'react';

const hidden=()=>typeof document!=='undefined'&&document.visibilityState==='hidden';

/**
 * Runs `tick` every `interval` ms while the page is visible: a hidden tab (another tab in front, a
 * minimised window, a locked phone) skips its ticks instead of polling the server, and runs one as
 * soon as it is shown again, so what it shows is current. Returns the cleanup.
 */
export function everyWhileVisible(tick:()=>void,interval:number){
  const id=setInterval(()=>{if(!hidden())tick();},interval);
  const shown=()=>{if(!hidden())tick();};
  document.addEventListener('visibilitychange',shown);
  return ()=>{clearInterval(id);document.removeEventListener('visibilitychange',shown);};
}

export function usePoll<T>(load:()=>Promise<T>, interval=5000) {
  const [data,setData]=useState<T|null>(null),[error,setError]=useState('');
  const generation=useRef(0);
  const refresh=useCallback(async()=>{const version=++generation.current;try{const next=await load();if(version===generation.current){setData(next);setError('');}}catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'Unable to load data.');}},[load]);
  useEffect(()=>{setData(null);void refresh();const stop=everyWhileVisible(()=>void refresh(),interval);return()=>{stop();generation.current++;};},[refresh,interval]);
  return {data,error,refresh};
}
