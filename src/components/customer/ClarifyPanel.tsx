'use client';
import type {ClarifyLine,ClarifyPayload} from '@/domain';
import {dropMessage,pickMessage} from '@/lib/clarify-messages';
import {MailLink,PhoneLink} from './contact-links';

// The clarifying reply's controls (spec §3, task 2.2), under Querent's question in the chat. In
// round 1 the question is the whole reply. From round 2 each open line shows its top 3 candidates
// as buttons (SKU, description, pack: never a price or cost) and a Drop this line button, and the
// assigned rep's name, phone and email follow so the customer can call instead. Every button sends
// an ordinary chat message (src/lib/clarify-messages.ts).

const SHOWN_FROM=2;

const isRequest=(payload:unknown):payload is ClarifyPayload=>
  typeof payload==='object'&&payload!==null&&Array.isArray((payload as ClarifyPayload).open);

function LineChoices({line,active,onSend}:{line:ClarifyLine;active:boolean;onSend:(message:string)=>void}){
  const said=`“${line.requested_text}”`;
  return <div className="clarify-line">
    <p className="clarify-said">For {said}</p>
    {line.choices.length>0&&<div className="clarify-choices" role="group" aria-label={`Choose the item for ${said}`}>
      {line.choices.map(c=><button key={c.sku} type="button" className="clarify-choice" disabled={!active}
        aria-label={`Choose ${c.sku}, ${c.description}, ${c.pack}`} onClick={()=>onSend(pickMessage(c))}>
        <span className="clarify-sku">{c.sku}</span>
        <span className="clarify-desc">{c.description}</span>
        <span className="clarify-pack">{c.pack}</span>
      </button>)}
    </div>}
    <button type="button" className="clarify-drop" disabled={!active} aria-label={`Drop this line: ${line.requested_text}`}
      onClick={()=>onSend(dropMessage(line))}>Drop this line</button>
  </div>;
}

export function ClarifyPanel({payload,active,onSend}:{payload:ClarifyPayload;active:boolean;onSend:(message:string)=>void}){
  if(!isRequest(payload))return null;
  const later=payload.open.filter(line=>line.round>=SHOWN_FROM);
  if(!later.length)return null;
  const {rep}=payload;
  return <div className="clarify-panel">
    {later.map((line,i)=><LineChoices key={`${i}-${line.requested_text}`} line={line} active={active} onSend={onSend}/>)}
    {/* The reply's text already says "Not sure? Call {rep}" (or points to Customer Service when no rep is assigned). */}
    {rep&&<section className="clarify-rep" aria-label="Call your rep">
      <span className="cx-rep-initials" aria-hidden="true">{rep.initials}</span>
      <div>
        <p className="clarify-rep-name">{rep.name}</p>
        <small>{rep.title}</small>
        <div className="clarify-rep-links"><PhoneLink phone={rep.phone}/><MailLink email={rep.email}/></div>
      </div>
    </section>}
  </div>;
}
