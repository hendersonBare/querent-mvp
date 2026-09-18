'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export function usePoll<T>(load:()=>Promise<T>, interval=5000) {
  const [data,setData]=useState<T|null>(null),[error,setError]=useState('');
  const generation=useRef(0);
  const refresh=useCallback(async()=>{const version=++generation.current;try{const next=await load();if(version===generation.current){setData(next);setError('');}}catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'Unable to load data.');}},[load]);
  useEffect(()=>{setData(null);void refresh();const id=setInterval(()=>void refresh(),interval);return()=>{clearInterval(id);generation.current++;};},[refresh,interval]);
  return {data,error,refresh};
}
