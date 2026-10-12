'use client';
import {useEffect,useMemo,useRef,useState,type KeyboardEvent,type MouseEvent,type RefObject} from 'react';
import {useRouter} from 'next/navigation';
import {ColumnsPicker,DataTable,FilterButton,FilterCheckbox,FilterGroup,Toggle,type DataColumn,type TablePrefs} from '@/components/ui';
import {Check} from '@/components/ui/Check';
import {Icon} from '@/components/ui/Icon';
import {cx} from '@/components/ui/cx';
import type {ReassignResult} from '@/server/rep/reassign';
import type {BoardCustomer,BoardRep,BoardTeam,TeamsBoard} from '@/server/rep/teams';
import {repsInTeams} from '@/server/teams/tree';
import {ReassignDialog} from '../reassign/ReassignDialog';
import {RepPageHeader} from '../RepPage';
import {assignCustomer,changeMembers,createTeam,loadBoard,moveTeam,saveActive} from './api';
import {CreateTeamDialog,DisconnectDialog,MembersDialog,MoveApprovalDialog,MoveTeamDialog} from './dialogs';
import {count,REPS_TABLE,repsLabel} from './format';
import s from './Teams.module.css';

// Teams and Reps (plan U7; Part 1 section 7; C_TRBase to C_TR7), the manager's page. No analytics here
// (they are on Analytics, plan U6).
//   Reps card: every rep (managers are not listed) with their customers, role (their title), team and
//   Active flag. The count button opens the rep's customers: an x disconnects one, asking for the new rep
//   in the same step (no customer is ever left without a rep, Appendix H); Connect a customer moves one
//   here, asking first when it has another rep, with the open quotes that would move. Active flags change
//   on the page and Save stores them (deactivation is refused while the rep has customers, decision 21).
//   Picking rows offers a bulk reassign of their open quotes (decision 45).
//   Teams card: the teams with the reps each counts (a parent counts the reps of the teams inside it,
//   decision 47); Create team; a selected team shows its reps and Add to team, Remove from team, Move
//   into other team.
// Every write goes through its backing route and the page shows the board the server returns.

/** Rows before "Show N more": every rep (the frames draw four). */
const ALL=1000;

interface RepFilter {teams:string[]}
const NO_REP_FILTER:RepFilter={teams:[]};
interface TeamFilter {reps:string[]}
const NO_TEAM_FILTER:TeamFilter={reps:[]};
const NO_TEAM='No team';
const toggle=<T,>(list:readonly T[],value:T,on:boolean)=>on?[...list,value]:list.filter(v=>v!==value);
/** A press on a control inside a row is that control's, not a pick of the row. */
const onControl=(target:EventTarget)=>target instanceof Element&&!!target.closest('button,a,input,label,[role="switch"]');

type Open=
  |{kind:'disconnect';customer:BoardCustomer;rep:BoardRep}
  |{kind:'approve';customer:BoardCustomer;rep:BoardRep}
  |{kind:'create'}
  |{kind:'move';team:BoardTeam}
  |{kind:'members';team:BoardTeam;mode:'add'|'remove'}
  |{kind:'reassign'}
  |null;

export function TeamsAndReps({initial,initialPrefs=null}:{initial:TeamsBoard;initialPrefs?:TablePrefs|null}){
  const router=useRouter();
  const [board,setBoard]=useState(initial);
  const [expanded,setExpanded]=useState<string[]>([]);
  const [connecting,setConnecting]=useState<string|null>(null);
  const [active,setActive]=useState<Record<string,boolean>>({});
  const [picked,setPicked]=useState<string[]>([]);
  const [team,setTeam]=useState<number|null>(null);
  const [repFilter,setRepFilter]=useState(NO_REP_FILTER);
  const [teamFilter,setTeamFilter]=useState(NO_TEAM_FILTER);
  const [open,setOpen]=useState<Open>(null);
  const [saving,setSaving]=useState(false);
  const [problem,setProblem]=useState<string|null>(null);

  const owner=(id:string|null)=>board.owners.find(o=>o.id===id);
  const memberships=useMemo(()=>board.teams.flatMap(t=>t.member_ids.map(rep_id=>({rep_id,team_id:t.id}))),[board.teams]);
  const done=(next:TeamsBoard)=>{
    setBoard(next);setOpen(null);
    setPicked(p=>p.filter(id=>next.reps.some(r=>r.id===id)));
    if(team!==null&&!next.teams.some(t=>t.id===team))setTeam(null);
    // Server-rendered pages (Customers, Quotes) read the new reps: re-read them on the next visit.
    router.refresh();
  };

  // The Reps filter (no frame): by team; a parent team takes in the reps of the teams inside it.
  const filtered=repFilter.teams.length
    ?(()=>{
      const inTeams=new Set(repsInTeams(board.teams,memberships,repFilter.teams.filter(t=>t!==NO_TEAM)));
      return board.reps.filter(r=>inTeams.has(r.id)||(repFilter.teams.includes(NO_TEAM)&&r.team_id===null));
    })()
    :board.reps;
  const isActive=(rep:BoardRep)=>active[rep.id]??rep.active;

  async function save(){
    const changes=board.reps.filter(r=>active[r.id]!==undefined&&active[r.id]!==r.active);
    if(saving)return;
    setSaving(true);setProblem(null);
    const refused:string[]=[];
    const stored:Record<string,boolean>={};
    for(const rep of changes){
      try{await saveActive(rep.id,active[rep.id]);stored[rep.id]=active[rep.id];}
      catch(e){refused.push(e instanceof Error?e.message:'That change wasn’t saved. Try again.');}
    }
    setBoard(b=>({...b,reps:b.reps.map(r=>r.id in stored?{...r,active:stored[r.id]}:r),owners:b.owners.map(o=>o.id in stored?{...o,active:stored[o.id]}:o)}));
    setActive(a=>Object.fromEntries(Object.entries(a).filter(([id])=>!(id in stored))));
    if(refused.length)setProblem(refused.join(' '));
    setSaving(false);
    if(Object.keys(stored).length)router.refresh();
  }

  const pick=(rep:BoardRep)=>setPicked(p=>p.includes(rep.id)?p.filter(id=>id!==rep.id):[...p,rep.id]);
  const columns:DataColumn<BoardRep>[]=[
    {id:'rep',label:'Rep name',track:'minmax(160px, 1.4fr)',align:'left',alwaysShown:true,render:r=><div className={s.repName}>{r.name}</div>},
    {id:'customers',label:'Customers',track:'0.9fr',align:'left',render:r=>{
      const shown=expanded.includes(r.id);
      return <div><button type="button" className={s.countButton} aria-expanded={shown}
        onClick={()=>{setExpanded(e=>shown?e.filter(id=>id!==r.id):[...e,r.id]);if(shown&&connecting===r.id)setConnecting(null);}}>
        {shown?'Hide customers':count(r.customer_ids.length,'customer')}</button></div>;
    }},
    {id:'role',label:'Role',track:'1.2fr',align:'left',render:r=><div>{r.title}</div>},
    {id:'team',label:'Team',track:'1.1fr',align:'left',render:r=><div>{r.team??<span className={s.muted}>{NO_TEAM}</span>}</div>},
    {id:'active',label:'Active',track:'70px',align:'left',render:r=><div>
      <Toggle checked={isActive(r)} label={`${r.name} active`} disabled={saving} onChange={on=>setActive(a=>({...a,[r.id]:on}))}/>
    </div>},
  ];
  const pickedReps=board.reps.filter(r=>picked.includes(r.id));
  const pickedQuotes=pickedReps.flatMap(r=>r.open_quotes);
  const teamNames=[...board.teams.map(t=>t.name),NO_TEAM];

  return <>
    <RepPageHeader title="Teams and Reps" description="Who is on your team and which customers they own"/>
    <div className={cx('ui-root',s.cards)}>
      <section className={cx(s.card,s.repsCard)} aria-labelledby="teams-reps-title">
        <div className={s.titleBar}>
          <span id="teams-reps-title" className={s.cardTitle}>Reps</span>
          <span className={s.cardNote}>{`${repsLabel(filtered.length)}. Managers are not listed.`}</span>
          <FilterButton<RepFilter> title="Filter reps" tone="bar" className={s.pushRight} value={repFilter} empty={NO_REP_FILTER} count={repFilter.teams.length} onApply={setRepFilter}>
            {(draft,set)=><FilterGroup label="Team" labelMargin="6px 0 2px">
              {teamNames.map(t=><FilterCheckbox key={t} label={t} checked={draft.teams.includes(t)} onChange={on=>set({teams:toggle(draft.teams,t,on)})}/>)}
            </FilterGroup>}
          </FilterButton>
          <button type="button" className={cx(s.green,s.save)} disabled={saving} onClick={()=>void save()}>Save</button>
        </div>
        {pickedReps.length>0&&<div className={s.pickBar} role="region" aria-label="Selected reps">
          <span className={s.pickName}>{pickedReps.length===1?pickedReps[0].name:repsLabel(pickedReps.length)}</span>
          <button type="button" className={s.barButton} disabled={!pickedQuotes.length} onClick={()=>setOpen({kind:'reassign'})}>Reassign open quotes</button>
        </div>}
        {problem&&<p className={s.problem} role="alert">{problem}</p>}
        <DataTable<BoardRep> tableId={REPS_TABLE} label="Reps" layout="bare" gap={14} columns={columns} rows={filtered} rowKey={r=>r.id} pageSize={ALL}
          moreLabel={n=>`Show ${n} more reps`} lessLabel="Show fewer reps" initialPrefs={initialPrefs}
          rowAttributes={r=>({'aria-selected':picked.includes(r.id),tabIndex:0,className:cx(s.selectable,picked.includes(r.id)&&s.picked),
            onClick:(e:MouseEvent<HTMLDivElement>)=>{if(!onControl(e.target))pick(r);},
            onKeyDown:(e:KeyboardEvent<HTMLDivElement>)=>{if((e.key===' '||e.key==='Enter')&&e.target===e.currentTarget){e.preventDefault();pick(r);}}})}
          rowDetail={r=>expanded.includes(r.id)&&<RepCustomers rep={r} board={board} connecting={connecting===r.id}
            onConnect={on=>setConnecting(on?r.id:null)}
            onDisconnect={customer=>setOpen({kind:'disconnect',customer,rep:r})}
            onPick={customer=>{setConnecting(null);setOpen({kind:'approve',customer,rep:r});}}/>}/>
        <div className={s.cardEnd}/>
      </section>
      <TeamsCard board={board} team={team} onTeam={setTeam} filter={teamFilter} onFilter={setTeamFilter} memberships={memberships}
        onCreate={()=>setOpen({kind:'create'})} onMembers={(t,mode)=>setOpen({kind:'members',team:t,mode})} onMove={t=>setOpen({kind:'move',team:t})}/>
    </div>
    {open?.kind==='disconnect'&&<DisconnectDialog customer={open.customer} from={owner(open.rep.id)!} owners={board.owners}
      write={(repId,move)=>assignCustomer(open.customer.id,repId,move)} onClose={()=>setOpen(null)} onDone={done}/>}
    {open?.kind==='approve'&&<MoveApprovalDialog customer={open.customer} from={owner(open.customer.rep_id)!} to={owner(open.rep.id)!}
      write={move=>assignCustomer(open.customer.id,open.rep.id,move)} onClose={()=>setOpen(null)} onDone={done}/>}
    {open?.kind==='create'&&<CreateTeamDialog board={board} write={createTeam} onClose={()=>setOpen(null)} onDone={done}/>}
    {open?.kind==='move'&&<MoveTeamDialog team={open.team} board={board} write={parent=>moveTeam(open.team.id,parent)} onClose={()=>setOpen(null)} onDone={done}/>}
    {open?.kind==='members'&&<MembersDialog team={open.team} board={board} mode={open.mode}
      write={ids=>changeMembers(open.team.id,open.mode==='add'?{add:ids}:{remove:ids})} onClose={()=>setOpen(null)} onDone={done}/>}
    {open?.kind==='reassign'&&<ReassignDialog quotes={pickedQuotes} me={board.me} currentRep={pickedReps.length===1?pickedReps[0].id:null}
      targets={board.owners.filter(o=>o.active).map(({id,name})=>({id,name}))} onClose={()=>setOpen(null)}
      onDone={(_result:ReassignResult)=>{setOpen(null);setPicked([]);void loadBoard().then(next=>{setBoard(next);router.refresh();}).catch(()=>router.refresh());}}/>}
  </>;
}

/** A rep's customers under their row (C_TR1), and Connect a customer (C_TR3). */
function RepCustomers({rep,board,connecting,onConnect,onDisconnect,onPick}:{rep:BoardRep;board:TeamsBoard;connecting:boolean;
  onConnect:(open:boolean)=>void;onDisconnect:(customer:BoardCustomer)=>void;onPick:(customer:BoardCustomer)=>void}){
  const mine=rep.customer_ids.map(id=>board.customers.find(c=>c.id===id)!).filter(Boolean);
  const wrap=useRef<HTMLDivElement>(null);
  return <div className={s.customers} role="group" aria-label={`Customers for ${rep.name}`}>
    <div className={s.customersLabel}>{`Customers for ${rep.name}`}</div>
    <div role="list" aria-label={`${rep.name}'s customers`}>
      {mine.map(c=><div key={c.id} role="listitem" className={s.customerItem}>
        <div className={s.customer}>
          <div className={s.customerName}><span className={s.bold}>{c.name}</span> <span className={s.code}>{c.account_number}</span></div>
          <button type="button" className={s.disconnect} aria-label={`Disconnect ${c.name}`} onClick={()=>onDisconnect(c)}>x</button>
        </div>
      </div>)}
    </div>
    <div ref={wrap} className={s.connectWrap}>
      <button type="button" className={s.connect} aria-expanded={connecting} onClick={()=>onConnect(!connecting)}><span className={s.plus}>+</span>Connect a customer</button>
      {connecting&&<ConnectList rep={rep} board={board} ignore={wrap} onClose={()=>onConnect(false)} onPick={onPick}/>}
    </div>
  </div>;
}

/**
 * Connect a customer, opened (C_TR3): a search over the customers that are not the rep's, each with its
 * current rep. Picking one with a rep asks to confirm the move (C_TR4); one with no rep is never listed
 * apart (every customer has one), so a pick always goes through the approval.
 */
function ConnectList({rep,board,ignore,onClose,onPick}:{rep:BoardRep;board:TeamsBoard;ignore:RefObject<HTMLDivElement|null>;onClose:()=>void;onPick:(customer:BoardCustomer)=>void}){
  const [query,setQuery]=useState('');
  const [activeIndex,setActiveIndex]=useState(0);
  const input=useRef<HTMLInputElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const q=query.trim().toLowerCase();
  const others=board.customers.filter(c=>c.rep_id!==rep.id&&(!q||c.name.toLowerCase().includes(q)||c.account_number.toLowerCase().includes(q)));
  useEffect(()=>{input.current?.focus({preventScroll:true});},[]);
  useEffect(()=>{
    const press=(event:globalThis.MouseEvent)=>{if(!ignore.current?.contains(event.target as Node))onClose();};
    document.addEventListener('mousedown',press);
    return ()=>document.removeEventListener('mousedown',press);
  },[ignore,onClose]);
  function key(event:KeyboardEvent){
    if(event.key==='Escape'){event.preventDefault();onClose();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActiveIndex(i=>Math.min(others.length-1,Math.max(0,i+(event.key==='ArrowDown'?1:-1))));return;}
    if(event.key==='Enter'&&others[activeIndex]){event.preventDefault();onPick(others[activeIndex]);}
  }
  const shown=Math.min(activeIndex,Math.max(0,others.length-1));
  return <div ref={list} className={s.connectList} data-ui="connect-list">
    <div className={s.search} data-ui="search">
      <Icon name="search" size={16}/>
      {!query&&<span className={s.placeholder} aria-hidden="true">Search customers</span>}
      <input ref={input} type="search" className={s.searchInput} aria-label="Search customers" value={query} autoComplete="off" spellCheck={false}
        aria-controls={`connect-${rep.id}`} aria-activedescendant={others[shown]?`connect-${rep.id}-${others[shown].id}`:undefined}
        onChange={e=>{setQuery(e.target.value);setActiveIndex(0);}} onKeyDown={key}/>
    </div>
    <div id={`connect-${rep.id}`} role="listbox" aria-label={`Connect a customer to ${rep.name}`} className={s.options}>
      {others.map((c,i)=><div key={c.id} id={`connect-${rep.id}-${c.id}`} role="option" aria-selected={i===shown} className={cx(s.option,i===shown&&s.optionOn)}
        onMouseDown={e=>e.preventDefault()} onClick={()=>onPick(c)} onMouseEnter={()=>setActiveIndex(i)}>
        <div><span className={s.bold}>{c.name}</span> <span className={s.code}>{c.account_number}</span></div>
        <span className={s.withRep}>{c.rep_name?`With ${c.rep_name}`:''}</span>
      </div>)}
      {!others.length&&<div className={s.empty}>No customers match.</div>}
    </div>
    <div className={s.listNote}>Customers that already have a rep ask you to confirm the move.</div>
  </div>;
}

/** The Teams card (C_TRBase, C_TR5): the teams with the reps each counts; a selected team's reps and actions. */
function TeamsCard({board,team,onTeam,filter,onFilter,memberships,onCreate,onMembers,onMove}:{board:TeamsBoard;team:number|null;onTeam:(id:number|null)=>void;
  filter:TeamFilter;onFilter:(f:TeamFilter)=>void;memberships:{rep_id:string;team_id:number}[];
  onCreate:()=>void;onMembers:(team:BoardTeam,mode:'add'|'remove')=>void;onMove:(team:BoardTeam)=>void}){
  const [picking,setPicking]=useState(false);
  const pickerCell=useRef<HTMLDivElement>(null);
  const selected=board.teams.find(t=>t.id===team)??null;
  const name=(id:string)=>board.owners.find(o=>o.id===id)?.name??id;
  // The Teams filter (no frame): the teams a picked rep counts in.
  const teams=filter.reps.length?board.teams.filter(t=>t.rep_ids.some(id=>filter.reps.includes(id))):board.teams;
  const people=board.owners.filter(o=>memberships.some(m=>m.rep_id===o.id)||o.role==='rep');
  return <section className={cx(s.card,s.teamsCard)} aria-labelledby="teams-teams-title">
    <div className={s.titleBar}>
      <span id="teams-teams-title" className={s.cardTitle}>Teams</span>
      <FilterButton<TeamFilter> title="Filter teams" tone="bar" align="right" className={s.pushRight} value={filter} empty={NO_TEAM_FILTER} count={filter.reps.length} onApply={onFilter}>
        {(draft,set)=><FilterGroup label="Rep" labelMargin="6px 0 2px">
          {people.map(p=><FilterCheckbox key={p.id} label={p.name} checked={draft.reps.includes(p.id)} onChange={on=>set({reps:toggle(draft.reps,p.id,on)})}/>)}
        </FilterGroup>}
      </FilterButton>
      <button type="button" className={cx(s.green,s.create)} onClick={onCreate}>Create team</button>
    </div>
    {selected&&<div className={s.pickBar} role="region" aria-label={selected.name}>
      <span className={s.pickName}>{selected.name}</span>
      <button type="button" className={s.barButton} onClick={()=>onMembers(selected,'add')}>Add to team</button>
      <button type="button" className={s.barButton} onClick={()=>onMembers(selected,'remove')}>Remove from team</button>
      <button type="button" className={s.barButton} onClick={()=>onMove(selected)}>Move into other team</button>
    </div>}
    <div className={s.teamHead}>
      <span>:: Team</span>
      <div ref={pickerCell} className={s.columnsCell}>
        <TeamsColumnsButton open={picking} onToggle={()=>setPicking(!picking)}/>
        <ColumnsPicker open={picking} onClose={()=>setPicking(false)} ignore={pickerCell} columns={[{id:'team',label:'Team',alwaysShown:true}]} order={['team']} hidden={[]}
          style={{top:37,right:-4}} onToggle={()=>{}} onMove={()=>{}} onReset={()=>{}}/>
      </div>
    </div>
    {teams.map(t=>{
      const on=t.id===team;
      return <div key={t.id} className={cx(s.teamGroup,on&&s.teamGroupOn)}>
        <label className={s.teamRow} style={t.depth?{paddingLeft:16+28*t.depth}:undefined}>
          <Check checked={on} onChange={checked=>onTeam(checked?t.id:null)}/>
          <span className={s.teamName}>{t.name}</span>
          <span className={s.teamCount}>{repsLabel(t.rep_ids.length)}</span>
        </label>
        {on&&<div className={s.chips} role="list" aria-label={`Reps in ${t.name}`}>
          {t.rep_ids.map(name).sort((a,b)=>a.localeCompare(b)).map(n=><span key={n} role="listitem" className={s.chip}>{n}</span>)}
        </div>}
      </div>;
    })}
    {!teams.length&&<p className={s.problem} style={{color:'var(--q-text-2)',paddingBottom:14}}>No teams yet.</p>}
  </section>;
}

/** The columns icon at the end of the Teams header (C_TRBase), as the tables draw it. */
function TeamsColumnsButton({open,onToggle}:{open:boolean;onToggle:()=>void}){
  return <button type="button" aria-label="Choose columns" aria-expanded={open} aria-haspopup="dialog" className={s.columnsButton} onClick={onToggle}>
    <Icon name="columns" size={16}/>
  </button>;
}

