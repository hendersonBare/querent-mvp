'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Select} from '@/components/ui';
import {Check} from '@/components/ui/Check';
import {cx} from '@/components/ui/cx';
import type {BoardCustomer,BoardOwner,BoardTeam,TeamsBoard} from '@/server/rep/teams';
import {moveTargets} from '@/server/teams/tree';
import {count,firstName,MOVE_NOTE,movingQuotes,repsLabel} from './format';
import d from './Dialog.module.css';

// Teams and Reps' dialogs (plan U7): Disconnect (C_TR2), the move approval (C_TR4), Create team (C_TR6),
// Move team (C_TR7), and Add to team and Remove from team (no frame: Create team's reps grid, the minimum
// to work, listed under "No frame"). Each is centred over the dimmed page at its frame's width and top,
// keeps focus inside, closes on Escape or Cancel with nothing sent, and shows a refusal in one red line.

export function TeamsDialog({title,width,top,onClose,busy=false,error,actions,children}:{
  title:string;width:number;top:number;onClose:()=>void;busy?:boolean;error?:string|null;actions:ReactNode;children?:ReactNode;
}){
  const [mounted,setMounted]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;});
  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{
    if(!mounted)return;
    const before=document.activeElement as HTMLElement|null;
    ref.current?.focus({preventScroll:true});
    return ()=>before?.focus({preventScroll:true});
  },[mounted]);
  function key(event:KeyboardEvent){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)close.current();return;}
    if(event.key!=='Tab')return;
    const focusable=[...(ref.current?.querySelectorAll<HTMLElement>('[tabindex="0"],input:not([disabled]),button:not([disabled])')??[])];
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  if(!mounted)return null;
  return createPortal(<div className={`ui-root ${d.layer}`}>
    <div className={d.backdrop} data-ui="teams-backdrop" onMouseDown={()=>{if(!busy)onClose();}}/>
    <div ref={ref} className={d.dialog} style={{top,width,marginLeft:-width/2}} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={key} data-ui="teams-dialog">
      <div className={d.title}>{title}</div>
      {children}
      {error&&<div role="alert" className={d.error}>{error}</div>}
      <div className={d.actions}>{actions}</div>
    </div>
  </div>,document.body);
}

/** Cancel and the green action, as each dialog draws them. */
function Actions({go,label,disabled,busy,onClose}:{go:()=>void;label:string;disabled?:boolean;busy:boolean;onClose:()=>void}){
  return <>
    <button type="button" className={d.cancel} onClick={onClose} disabled={busy}>Cancel</button>
    <button type="button" className={d.go} onClick={go} disabled={busy||disabled}>{label}</button>
  </>;
}

/** A radio row (the new rep, the team to sit inside): arrow keys move, Space or Enter picks. */
function Choices<V extends string|number|null>({options,value,onPick,label}:{options:readonly {value:V;name:string;sub:string}[];value:V|undefined;onPick:(value:V)=>void;label:string}){
  const ref=useRef<HTMLDivElement>(null);
  function key(event:KeyboardEvent,index:number){
    if(event.key===' '||event.key==='Enter'){event.preventDefault();onPick(options[index].value);return;}
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    event.preventDefault();
    const next=Math.min(options.length-1,Math.max(0,index+(event.key==='ArrowDown'?1:-1)));
    onPick(options[next].value);
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }
  const picked=options.findIndex(o=>o.value===value);
  return <div ref={ref} role="radiogroup" aria-label={label}>
    {options.map((o,i)=>{
      const on=i===picked;
      return <div key={String(o.value)} role="radio" aria-checked={on} tabIndex={on||(picked<0&&i===0)?0:-1} className={cx(d.choice,on&&d.choiceOn)}
        onClick={()=>onPick(o.value)} onKeyDown={e=>key(e,i)}>
        <span className={cx(d.dot,on&&d.dotOn)}>{on&&<span className={d.dotFill}/>}</span>
        <div className={d.choiceText}><div className={d.choiceName}>{o.name}</div><div className={d.choiceSub}>{o.sub}</div></div>
      </div>;
    })}
  </div>;
}

/** "Also move this customer's open quotes", with the line under it. */
function MoveQuotes({label,checked,onChange}:{label:string;checked:boolean;onChange:(on:boolean)=>void}){
  const id=useId();
  return <label className={d.move}>
    <span className={d.moveBox}><Check checked={checked} onChange={onChange} aria-labelledby={id}/></span>
    <div><div id={id} className={d.moveTitle}>{label}</div><div className={d.moveSub}>{MOVE_NOTE}</div></div>
  </label>;
}

/** Runs a write, keeping the dialog open with the server's reason on a refusal. */
function useWrite(onDone:(board:TeamsBoard)=>void){
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  async function run(write:()=>Promise<TeamsBoard>){
    setBusy(true);setError(null);
    try{onDone(await write());}
    catch(e){setError(e instanceof Error?e.message:'That change wasn’t saved. Try again.');setBusy(false);}
  }
  return {busy,error,run};
}

const customersLine=(owner:BoardOwner)=>owner.customer_count?count(owner.customer_count,'customer'):'No customers yet';

/**
 * Disconnect a customer (C_TR2): every customer needs a rep, so the new rep is picked in the same step
 * (Appendix H). The other active reps and the manager are offered, by name.
 */
export function DisconnectDialog({customer,from,owners,write,onClose,onDone}:{customer:BoardCustomer;from:BoardOwner;owners:readonly BoardOwner[];
  write:(repId:string,move:boolean)=>Promise<TeamsBoard>;onClose:()=>void;onDone:(board:TeamsBoard)=>void}){
  const [to,setTo]=useState<string>();
  const [move,setMove]=useState(false);
  const {busy,error,run}=useWrite(onDone);
  const options=owners.filter(o=>o.active&&o.id!==from.id).map(o=>({value:o.id,name:o.name,sub:customersLine(o)}));
  return <TeamsDialog title={`Disconnect ${customer.name}?`} width={560} top={150} onClose={onClose} busy={busy} error={error}
    actions={<Actions label="Disconnect and reassign" disabled={!to} busy={busy} onClose={onClose} go={()=>{if(to)void run(()=>write(to,move));}}/>}>
    <div className={d.text}>{`Every customer needs a rep. Pick who takes ${customer.name} from ${from.name}.`}</div>
    <Choices label="New rep" options={options} value={to} onPick={setTo}/>
    <MoveQuotes label="Also move this customer's open quotes" checked={move} onChange={setMove}/>
  </TeamsDialog>;
}

/** The move approval (C_TR4): connecting a customer that has another rep takes it off them; the open quotes that would move are counted. */
export function MoveApprovalDialog({customer,from,to,write,onClose,onDone}:{customer:BoardCustomer;from:BoardOwner;to:BoardOwner;
  write:(move:boolean)=>Promise<TeamsBoard>;onClose:()=>void;onDone:(board:TeamsBoard)=>void}){
  const [move,setMove]=useState(false);
  const {busy,error,run}=useWrite(onDone);
  const quotes=movingQuotes(customer,to.id);
  return <TeamsDialog title={`${customer.name} is with ${from.name}`} width={540} top={200} onClose={onClose} busy={busy} error={error}
    actions={<Actions label={`Move to ${to.name}`} busy={busy} onClose={onClose} go={()=>void run(()=>write(move))}/>}>
    <div className={d.text}>{`Connecting it to ${to.name} takes it off ${from.name}. ${firstName(from.name)} will keep ${count(Math.max(0,from.customer_count-1),'customer')}.`}</div>
    <MoveQuotes label={`Also move this customer's open quotes (${count(quotes,'quote')})`} checked={move} onChange={setMove}/>
  </TeamsDialog>;
}

/** Reps to tick, two to a row (C_TR6 "Add reps"). */
function RepsGrid({people,picked,onChange}:{people:readonly BoardOwner[];picked:readonly string[];onChange:(ids:string[])=>void}){
  return <div className={d.grid}>
    {people.map(p=><label key={p.id} className={d.pick}>
      <Check checked={picked.includes(p.id)} onChange={on=>onChange(on?[...picked,p.id]:picked.filter(id=>id!==p.id))}/>
      <span>{p.name}</span>
    </label>)}
  </div>;
}

const NONE='none';

/** Create team (C_TR6): a name, the reps to add (out of their old teams) and the team it sits inside, if any. */
export function CreateTeamDialog({board,write,onClose,onDone}:{board:TeamsBoard;write:(body:{name:string;rep_ids:string[];parent_team_id:number|null})=>Promise<TeamsBoard>;onClose:()=>void;onDone:(board:TeamsBoard)=>void}){
  const [name,setName]=useState('');
  const [reps,setReps]=useState<string[]>([]);
  const [parent,setParent]=useState<string>(NONE);
  const {busy,error,run}=useWrite(onDone);
  const nameId=useId(),parentId=useId();
  const people=board.owners.filter(o=>o.active);
  const go=()=>{if(name.trim())void run(()=>write({name:name.trim(),rep_ids:people.filter(p=>reps.includes(p.id)).map(p=>p.id),parent_team_id:parent===NONE?null:Number(parent)}));};
  return <TeamsDialog title="Create team" width={520} top={170} onClose={onClose} busy={busy} error={error}
    actions={<Actions label="Create team" disabled={!name.trim()} busy={busy} onClose={onClose} go={go}/>}>
    <div className={d.field}>
      <div id={nameId} className={d.fieldLabel}>Team name</div>
      <input className={d.fieldBox} type="text" aria-labelledby={nameId} autoComplete="off" maxLength={40} value={name}
        onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();go();}}}/>
    </div>
    <div className={d.groupLabel}>Add reps</div>
    <RepsGrid people={people} picked={reps} onChange={setReps}/>
    <div className={d.spacer}/>
    <div className={d.field}>
      <div id={parentId} className={d.fieldLabel}>Inside another team</div>
      <Select label="Inside another team" labelledBy={parentId} value={parent} onChange={setParent} filled className={d.fieldBox}
        options={[{value:NONE,label:'None'},...board.teams.map(t=>({value:String(t.id),label:t.name}))]}/>
    </div>
  </TeamsDialog>;
}

/** Move team (C_TR7): inside another team (never itself or a team inside it), or on its own. */
export function MoveTeamDialog({team,board,write,onClose,onDone}:{team:BoardTeam;board:TeamsBoard;write:(parentId:number|null)=>Promise<TeamsBoard>;onClose:()=>void;onDone:(board:TeamsBoard)=>void}){
  const [parent,setParent]=useState<number|null>(team.parent_team_id);
  const {busy,error,run}=useWrite(onDone);
  const options=[
    ...moveTargets(board.teams,team.id).map(t=>({value:t.id as number|null,name:t.name,sub:repsLabel(t.rep_ids.length)})),
    {value:null,name:'No parent team',sub:`${team.name} stands on its own`},
  ];
  return <TeamsDialog title={`Move ${team.name} into another team`} width={520} top={190} onClose={onClose} busy={busy} error={error}
    actions={<Actions label="Move team" busy={busy} onClose={onClose} go={()=>void run(()=>write(parent))}/>}>
    <div className={d.text}>{`Reps in ${team.name} stay in it, and also count in the team you pick.`}</div>
    <Choices label="Team to sit inside" options={options} value={parent} onPick={setParent}/>
  </TeamsDialog>;
}

/** Add to team or Remove from team (no frame): Create team's reps grid, the people who can join or the team's own members. */
export function MembersDialog({team,board,mode,write,onClose,onDone}:{team:BoardTeam;board:TeamsBoard;mode:'add'|'remove';
  write:(repIds:string[])=>Promise<TeamsBoard>;onClose:()=>void;onDone:(board:TeamsBoard)=>void}){
  const [picked,setPicked]=useState<string[]>([]);
  const {busy,error,run}=useWrite(onDone);
  const people=board.owners.filter(o=>mode==='add'?o.active&&!team.member_ids.includes(o.id):team.member_ids.includes(o.id));
  const label=mode==='add'?'Add to team':'Remove from team';
  return <TeamsDialog title={mode==='add'?`Add reps to ${team.name}`:`Remove reps from ${team.name}`} width={520} top={170} onClose={onClose} busy={busy} error={error}
    actions={<Actions label={label} disabled={!picked.length} busy={busy} onClose={onClose} go={()=>void run(()=>write(people.filter(p=>picked.includes(p.id)).map(p=>p.id)))}/>}>
    <div className={d.spacer}/>
    {people.length?<RepsGrid people={people} picked={picked} onChange={setPicked}/>:<div className={d.text}>{mode==='add'?'Everyone is in this team.':'No reps in this team yet.'}</div>}
  </TeamsDialog>;
}
