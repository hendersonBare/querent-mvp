'use client';
import {useId,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import {FileText,LogOut,MessageSquare,Users} from 'lucide-react';
import type {API,Principal} from '@/lib/contracts';
import {ERPIndicator} from '@/features/erp-status/Status';
import {ContactsSidebar} from './ContactsSidebar';
import {QuotePreview} from './quote-preview/QuotePreview';
import {QuotesSidebar} from './QuotesSidebar';

// The customer workspace (spec §3): header, then contacts on the left, the chat in the center and
// the quote buttons on the right. Below 960px the three columns become Chat / Contacts / Quotes
// tabs (customer.css hides the panes that aren't selected; the tab bar is hidden on wider screens).
// The PDF preview modal (task 5.1) waits here for the sidebar's and the chat's "open quote".

const PANES=[
  {id:'chat',label:'Chat',Icon:MessageSquare},
  {id:'contacts',label:'Contacts',Icon:Users},
  {id:'quotes',label:'Quotes',Icon:FileText},
] as const;
type Pane=typeof PANES[number]['id'];

export function CustomerLayout({api,user,signOut,children}:{api:API;user:Principal;signOut:()=>void;children:ReactNode}){
  const [pane,setPane]=useState<Pane>('chat');
  const base=useId();
  const paneId=(id:Pane)=>`${base}-${id}`;
  const tabs=useRef<(HTMLButtonElement|null)[]>([]);
  function onTabKey(event:KeyboardEvent,index:number){
    const next={ArrowRight:index+1,ArrowLeft:index-1,Home:0,End:PANES.length-1}[event.key];
    if(next===undefined)return;
    event.preventDefault();
    const target=(next+PANES.length)%PANES.length;
    setPane(PANES[target].id);
    tabs.current[target]?.focus();
  }
  return <div className="customer-shell">
    <header className="customer-header">
      <div className="header-brand">
        <img src="/querent-logo.png" alt="Querent" width="34" height="34"/>
        <strong>{user.name}</strong>
        <span className="via">via Querent</span>
      </div>
      <div className="header-actions">
        <ERPIndicator api={api}/>
        <button className="workspace-switch" aria-label="Switch workspace" onClick={signOut}><LogOut size={16}/><span>Switch workspace</span></button>
      </div>
    </header>
    <div className="cx-tabs" role="tablist" aria-label="Workspace">
      {PANES.map(({id,label,Icon},index)=><button key={id} ref={el=>{tabs.current[index]=el;}} type="button" role="tab" className="cx-tab" id={`${paneId(id)}-tab`}
        aria-selected={pane===id} aria-controls={paneId(id)} tabIndex={pane===id?0:-1} onClick={()=>setPane(id)} onKeyDown={event=>onTabKey(event,index)}>
        <Icon size={16} aria-hidden="true"/>{label}
      </button>)}
    </div>
    <div className="cx-body" data-pane={pane}>
      <aside className="cx-pane cx-left" id={paneId('contacts')} aria-label="Contacts"><ContactsSidebar api={api}/></aside>
      <div className="cx-pane cx-center" id={paneId('chat')}>{children}</div>
      <aside className="cx-pane cx-right" id={paneId('quotes')} aria-label="Quotes"><QuotesSidebar api={api}/></aside>
    </div>
    <QuotePreview api={api}/>
  </div>;
}
