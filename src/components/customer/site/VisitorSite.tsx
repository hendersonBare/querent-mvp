'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import s from './site.module.css';
import {QueryBox} from './QueryBox';
import {Turn} from './Turn';

/** C_CVE0's public starter questions (new-ui-implementation-prompt Appendix E). */
export const PUBLIC_STARTERS=['Do you have 1/2 in grade 8 hex bolts in stock?','What are the branch hours?','Do you deliver to Ogden?','How do I open an account?'] as const;

interface VisitorTurn {id:string;question:string;answer:string}

/**
 * The visitor's box (plan U10; C_CVE0; decisions 49 and 53): with no session, the base box with the
 * public starter questions. Every question goes to the R-14 stub, which answers "Sign in to
 * continue." and never calls the model or a tool. The strip's Sign in (the only part of the stand-in
 * header that is built) opens the demo chooser at /demo.
 */
export function VisitorSite(){
  const router=useRouter();
  const [question,setQuestion]=useState('');
  const [turns,setTurns]=useState<VisitorTurn[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function ask(text:string){
    if(!text.trim()||busy)return;
    setBusy(true);setError('');setQuestion('');
    const id=crypto.randomUUID();
    setTurns(t=>[...t,{id,question:text,answer:''}]);
    try{
      // TODO(R-14): the real anonymous query route replaces this stub.
      const response=await fetch('/api/query/visitor/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:text}),cache:'no-store'});
      const result=await response.json() as {answer?:string};
      if(!response.ok||typeof result.answer!=='string')throw new Error('Unable to send.');
      setTurns(t=>t.map(turn=>turn.id===id?{...turn,answer:result.answer!}:turn));
    }catch(e){
      setTurns(t=>t.filter(turn=>turn.id!==id));
      setQuestion(text);
      setError(e instanceof Error?e.message:'Unable to send.');
    }finally{setBusy(false);}
  }
  return <div className={s.page}>
    <div className={s.bar}>
      <span className={s.spacer}/>
      <button type="button" className={s.signIn} onClick={()=>router.push('/demo')}>Sign in</button>
    </div>
    <main className={`${s.main} ${s.mainVisitor}`}>
      <QueryBox heading={<>Ask about stock,<br/>items and branches.</>} sub="Open to everyone. Sign in to see your own prices, orders and quotes."
        starters={PUBLIC_STARTERS} onStarter={q=>void ask(q)} startersDisabled={busy} showWelcome={turns.length===0}
        talk={turns.length?<div className="turns">{turns.map(t=><Turn key={t.id} question={t.question} answer={t.answer}/>)}</div>:null}
        question={question} onQuestion={setQuestion} onSubmit={()=>void ask(question)} busy={busy} error={error}/>
    </main>
  </div>;
}
