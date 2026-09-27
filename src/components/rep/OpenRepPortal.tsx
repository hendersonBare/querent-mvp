'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {HOME_SECTION} from './scope';

/** Shown for a moment after the supplier persona is chosen at /: the rep portal lives at /rep. */
export function OpenRepPortal(){
  const router=useRouter();
  useEffect(()=>{router.replace(HOME_SECTION.href);},[router]);
  return <main className="setup-state" role="status"><img src="/querent-logo.png" alt="" width="55" height="55"/><p>Opening the rep portal…</p></main>;
}
