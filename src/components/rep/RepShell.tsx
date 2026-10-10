'use client';
import {useCallback,useEffect,useId,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import {Bell,LogOut,TriangleAlert} from 'lucide-react';
import type {CustomerListItem} from '@/domain';
import {createAPI} from '@/lib/api';
import {usePoll} from '@/lib/use-poll';
import type {RepBadges} from '@/server/rep/badges';
import {ATTENTION_PARAM,overdueLabel} from './quotes/labels';
import {RepPortalContext,useRepPortal,useRepScope,type RepIdentity,type RepPortalValue} from './context';
import {ALL_CUSTOMERS,ALL_REPS,HOME_SECTION,REPS_PARAM,SCOPE_PARAM,isAllReps,sectionFor,sectionsFor} from './scope';
import s from './RepShell.module.css';

// The rep portal frame (spec §4, docs/design/screens/03): the app bar (Querent, Herrick, the
// section nav with the Quotes unread badge, search, the red Needs attention badge, bell, BG), then
// the "Viewing" customer picker. The Needs attention badge (v3 spec §3, task A2) counts the rep's
// red quotes only and sits beside the unread badge, which stays (OA-8). In the manager's All reps
// scope (?scope=all, task D2) it counts every rep's red quotes, like the list (OA-52). The manager's
// nav also has Team (v3 spec §6, task D3).

/** How often the nav badges are re-read, so a customer's new request shows up without a reload. */
export const BADGE_POLL_MS=5000;

export interface RepShellProps {
  rep:RepIdentity;org:string;customers:CustomerListItem[];
  /** The badges as the server rendered them; the shell then polls GET /api/rep/badges. */
  initialBadges:RepBadges;
  /** Font variables from the layout. */
  className?:string;
  children:ReactNode;
}

const leave=()=>window.location.assign('/');

/** GET /api/rep/badges, or, in the manager's All reps scope, its every-rep red count (?scope=all, OA-52, task D2). */
async function loadBadges(allReps:boolean):Promise<RepBadges>{
  const response=await fetch(allReps?`/api/rep/badges?${REPS_PARAM}=${ALL_REPS}`:'/api/rep/badges',{cache:'no-store'});
  if(response.status===401||response.status===403){leave();throw new Error('Choose a demo workspace.');}
  if(!response.ok)throw new Error('Unable to load notifications.');
  return response.json();
}

export function RepShell({rep,org,customers,initialBadges,className,children}:RepShellProps){
  const signOut=useCallback(()=>{void fetch('/api/session',{method:'DELETE'}).finally(leave);},[]);
  const api=useMemo(()=>createAPI(leave),[]);
  const allReps=!!rep.manager&&isAllReps(useSearchParams().get(REPS_PARAM));
  const load=useCallback(()=>loadBadges(allReps),[allReps]);
  const {data,refresh}=usePoll(load,BADGE_POLL_MS);
  const badges=data??initialBadges;
  const value=useMemo<RepPortalValue>(()=>({rep,org,customers,api,badges,refreshBadges:()=>void refresh(),signOut}),[rep,org,customers,api,badges,refresh,signOut]);
  return <RepPortalContext.Provider value={value}>
    <div className={[s.portal,className].filter(Boolean).join(' ')}>
      <RepHeader/>
      <main className={s.page}>{children}</main>
    </div>
  </RepPortalContext.Provider>;
}

function RepHeader(){
  const {org,badges,rep}=useRepPortal();
  const scope=useRepScope();
  const pathname=usePathname();
  const active=sectionFor(pathname);
  const unread=badges.quotes;
  const navRef=useRef<HTMLElement>(null);
  // On a phone the nav is a scrolling strip: keep the current section in view.
  useEffect(()=>{
    const strip=navRef.current,link=strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if(!strip||!link||strip.scrollWidth<=strip.clientWidth)return;
    if(link.offsetLeft<strip.scrollLeft||link.offsetLeft+link.offsetWidth>strip.scrollLeft+strip.clientWidth-28)strip.scrollLeft=link.offsetLeft-12;
  },[active?.id]);
  return <header className={s.header}>
    <div className={s.appbar}>
      <div className={s.brand}><span className={s.mark} aria-hidden="true">Q</span>Querent<span className={s.org}>{org}</span></div>
      <nav ref={navRef} className={s.nav} aria-label="Rep portal">
        {sectionsFor(!!rep.manager).map(section=><Link key={section.id} className={s.navLink} href={scope.href(section.href)} aria-current={active?.id===section.id?'page':undefined}>
          {section.label}
          {section.id==='quotes'&&unread>0&&<span className={s.count}>{unread}<span className={s.srOnly}> unread</span></span>}
        </Link>)}
      </nav>
      <PortalSearch/>
      <div className={s.user}>
        <AttentionBadge/>
        <Link className={s.iconButton} href={scope.href(HOME_SECTION.href)} aria-label={unread?`Notifications: ${unread} unread ${unread===1?'quote':'quotes'}`:'Notifications: none unread'}>
          <Bell aria-hidden="true" size={18} strokeWidth={1.7}/>
          {unread>0&&<span className={s.dot}/>}
        </Link>
        <AccountMenu/>
      </div>
    </div>
    <CustomerPicker/>
  </header>;
}

/** The rep's red (Overdue) quotes, opening the Quotes list's Needs attention filter. Hidden at zero. */
function AttentionBadge(){
  const {badges}=useRepPortal();
  const scope=useRepScope();
  const count=badges.attention??0;
  if(count<=0)return null;
  return <Link className={s.attention} href={scope.href(`/rep/quotes?${ATTENTION_PARAM}=1`)} aria-label={`Needs attention: ${overdueLabel(count)}`} title={`${overdueLabel(count)}: open the Needs attention list`}>
    <TriangleAlert aria-hidden="true" size={14} strokeWidth={2.2}/><span className={s.attentionWord}>Needs attention</span><span className={s.attentionCount}>{count}</span>
  </Link>;
}

/** Search is sample-only, as in the mockup: Enter explains it rather than doing nothing. */
function PortalSearch(){
  const [note,setNote]=useState('');
  useEffect(()=>{if(!note)return;const t=setTimeout(()=>setNote(''),4000);return()=>clearTimeout(t);},[note]);
  function submit(event:FormEvent){event.preventDefault();setNote('Search isn’t available yet in this demo.');}
  return <form className={s.search} role="search" onSubmit={submit}>
    <input type="search" placeholder="Search quotes, customers, SKUs" aria-label="Search the portal"/>
    <p className={s.searchNote} role="status">{note}</p>
  </form>;
}

function AccountMenu(){
  const {rep,org,signOut}=useRepPortal();
  const [open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),first=useRef<HTMLButtonElement>(null);
  const menuId=useId();
  useEffect(()=>{
    if(!open)return;
    first.current?.focus();
    const outside=(event:PointerEvent)=>{if(!wrap.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div className={s.menuWrap} ref={wrap}>
    <button ref={button} type="button" className={s.avatar} title={`${rep.name}, ${rep.title}`} aria-label={`Account: ${rep.name}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open?menuId:undefined} onClick={()=>setOpen(o=>!o)}>{rep.initials}</button>
    {open&&<div className={s.menu} id={menuId} role="menu" aria-label="Account">
      <div className={s.menuWho}><strong>{rep.name}</strong><small>{rep.title} · {org}</small></div>
      <hr/>
      <button ref={first} type="button" role="menuitem" onClick={signOut}><LogOut aria-hidden="true" size={15}/>Switch workspace</button>
    </div>}
  </div>;
}

/** "Viewing": All customers or one customer. The choice lives in ?customer= (see ./scope). */
function CustomerPicker(){
  const {customers}=useRepPortal();
  const scope=useRepScope();
  const requested=useSearchParams().get(SCOPE_PARAM);
  // An unknown ?customer= reads as All customers; drop it so the URL says what the page shows.
  const stale=!!requested&&requested!==ALL_CUSTOMERS&&scope.customerId===null;
  const {setCustomer}=scope;
  useEffect(()=>{if(stale)setCustomer(null);},[stale,setCustomer]);
  const c=scope.customer;
  return <div className={s.scopebar}>
    <label className={s.scopeLabel} htmlFor="rep-viewing">Viewing</label>
    <select id="rep-viewing" className={s.scopeSelect} value={scope.customerId??ALL_CUSTOMERS} onChange={event=>scope.setCustomer(event.target.value===ALL_CUSTOMERS?null:event.target.value)}>
      <option value={ALL_CUSTOMERS}>All customers</option>
      {customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
    </select>
    {c&&<span className={s.scopeMeta}><span className={s.mono}>{c.account_number}</span>{c.rep_name&&<> · Rep {c.rep_name}</>}</span>}
  </div>;
}
