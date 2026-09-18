import {Phone,Mail} from 'lucide-react';
import {labels,type AccessRule} from '@/lib/contracts';
export function RepPanel({rules}:{rules:AccessRule[]|null}){
 const enabled=rules?.filter(r=>r.enabled)??[];
 return <div className="rep-panel"><p className="eyebrow">YOUR CONTACTS</p><h2>Here to help.</h2><p className="muted panel-intro">Your Century Equipment team.</p>{rules===null?<p className="muted" role="status">Loading contacts…</p>:<>{enabled.map(r=><section className="rep-item" key={r.category}><h3>{labels[r.category]}</h3><p>{r.rep_name||'Self-serve'}</p>{r.phone&&<a href={`tel:${r.phone.replace(/[^+\d]/g,'')}`}><Phone size={13}/>{r.phone}</a>}{r.email&&<a href={`mailto:${r.email}`}><Mail size={13}/>{r.email}</a>}</section>)}{enabled.length===0&&<p className="muted">No categories are currently available.</p>}</>}</div>;
}
