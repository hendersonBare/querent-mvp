'use client';
import {useCallback,useId} from 'react';
import {Mail,Phone} from 'lucide-react';
import type {CustomerContacts} from '@/domain';
import type {API} from '@/lib/contracts';
import {usePoll} from '@/lib/use-poll';

// Left sidebar (spec §3): the assigned rep as its own section at the very top, then the
// department contacts. Static seed data, so it refreshes rarely.

const tel=(phone:string)=>`tel:${phone.replace(/[^+\d]/g,'')}`;
const PhoneLink=({phone}:{phone:string})=><a className="cx-link" href={tel(phone)}><Phone size={14} aria-hidden="true"/>{phone}</a>;
/** A narrow sidebar wraps a long address after the @ rather than mid-word. */
function MailLink({email}:{email:string}){
  const at=email.indexOf('@');
  return <a className="cx-link" href={`mailto:${email}`}><Mail size={14} aria-hidden="true"/><span>{at<0?email:<>{email.slice(0,at+1)}<wbr/>{email.slice(at+1)}</>}</span></a>;
}

export function ContactsSidebar({api}:{api:API}){
  const load=useCallback(()=>api.get<CustomerContacts>('customer/contacts'),[api]);
  const {data,error}=usePoll(load,60_000);
  const repHeading=useId(),teamHeading=useId();
  return <div className="cx-contacts">
    {error&&<p className="error" role="alert">{error}</p>}
    {!data?(!error&&<p className="muted" role="status">Loading contacts…</p>):<>
      <section className="cx-section" aria-labelledby={repHeading}>
        <h2 className="eyebrow cx-eyebrow" id={repHeading}>Your rep</h2>
        {data.rep?<div className="cx-rep">
          <div className="cx-rep-who">
            <span className="cx-rep-initials" aria-hidden="true">{data.rep.initials}</span>
            <div><strong>{data.rep.name}</strong><small>{data.rep.title}</small></div>
          </div>
          <PhoneLink phone={data.rep.phone}/>
          <MailLink email={data.rep.email}/>
        </div>:<p className="muted cx-note">No rep is assigned yet. Customer Service can help.</p>}
      </section>
      <section className="cx-section" aria-labelledby={teamHeading}>
        <h2 className="eyebrow cx-eyebrow" id={teamHeading}>{data.supplier}</h2>
        {data.departments.map(d=><div className="cx-contact" key={d.id}>
          <h3>{d.name}</h3>
          <PhoneLink phone={d.phone}/>
          {d.email&&<MailLink email={d.email}/>}
          <small className="cx-hours">{d.hours}</small>
        </div>)}
        {data.willCall.length>0&&<div className="cx-contact">
          <h3>Warehouse / Will-call</h3>
          <ul className="cx-branches" aria-label="Warehouse / Will-call by branch">
            {data.willCall.map(b=><li key={b.id}>
              <span className="cx-branch-code" title={b.name}>{b.code}</span>
              <div><PhoneLink phone={b.phone}/><small className="cx-hours">{b.hours}</small></div>
            </li>)}
          </ul>
        </div>}
      </section>
    </>}
  </div>;
}
