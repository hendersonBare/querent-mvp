import 'server-only';
import type {CartLine,ClarifyLine,ClarifyPayload,ClarifyRep,ItemCandidate,ItemPopupPayload} from '@/domain';
import type {Category} from '@/lib/contracts';
import {NO_MATCH_QUESTION} from '@/server/matching';
import {assignedRep,branches,catalogItem} from '@/server/repository/customer';
import {UNIT_QTY,withoutQty} from './lines';
import {reply,repHelp,type ChatReply} from './reply';
import {proposeCartTool,type ItemSearchLine,type ToolContext} from './tools';

// The clarification loop (spec §3, task 2.2): Querent never guesses a SKU. A quote request is kept
// line by line in the `clarify` message's payload: each requested line is matched to one SKU (in
// the cart) or open, with the 1.4 clarifying question and a round count. Scripted and live chat
// both run the request through this module, so rounds, buttons and the rep's contact behave the same.
//
// Rounds ("after 2 rounds", defined here):
//   - A line's round counts the tries that gave no confident match. The request itself is round 1:
//     Querent asks the line's clarifying question.
//   - A reply that settles no line (nothing matched, picked or dropped) moves every open line to the
//     next round, and Querent asks again. Narrowing a line without settling it ("Type 27" when two
//     Type 27 wheels are left) is not settling it.
//   - A reply that settles or drops some line leaves the other open lines in their round.
//   - From round 2, so on the second question about a line, the reply shows the line's top 3
//     candidates as buttons and the assigned rep's name, phone and email, and the customer can drop
//     the line. They stay until the line is matched or dropped.
//
// The buttons send ordinary chat messages ("CW-45-045-T1 (Cut-off wheel ...)" picks a candidate,
// `Drop "6 boxes of cut-off wheels"` drops a line), and readAction settles those before any language
// handling, so a typed SKU or "drop the wheels" works the same.

/** From this round a line shows its candidates as buttons, and the reply the rep's contact. */
export const CANDIDATE_ROUND=2;
/** How many candidates become buttons. */
export const CANDIDATE_BUTTONS=3;

/** Matching, clarifying and the pop-up are logged under Items & stock, the toggle their tools check. */
const ITEMS:Category[]=['items_stock'];

/** Pickup or delivery, and the branch. */
export type Where=Pick<ItemPopupPayload,'fulfillment'|'branch_id'>;

const joinAnd=(parts:string[])=>parts.length<2?parts.join(''):`${parts.slice(0,-1).join(', ')} and ${parts.at(-1)}`;
const unique=<T>(values:T[])=>[...new Set(values)];

/** "SKU (description, pack)", how chat names an item. */
export const itemLabel=(item:{sku:string;description:string;pack:string})=>`${item.sku} (${item.description}, ${item.pack.toLowerCase()})`;
const describeLine=(line:CartLine)=>{const item=catalogItem(line.sku);return `${line.qty} × ${item?itemLabel(item):line.sku}`;};
/** What to call a line in a sentence: "cut-off wheels" for "6 boxes of cut-off wheels". */
const lineName=(line:{requested_text:string})=>withoutQty(line.requested_text).replace(/^(?:the|some|any)\s+/i,'')||line.requested_text;
const quoted=(text:string)=>`“${text}”`;

// ---- Pickup or delivery --------------------------------------------------------------------------

const DELIVERY=/\bdeliver(?:y|ed)?\b|\bship(?:ped|ping)?\b/i;
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** Pickup or delivery and the branch a message names, else `fallback`'s, else pickup at the first branch. */
export function whereIn(text:string,fallback?:Where):Where{
  const all=branches();
  const fulfillment=DELIVERY.test(text)?'delivery':fallback?.fulfillment??'will_call';
  const named=all.find(b=>[b.code,b.name,b.city,b.city.replace(/\s+city$/i,'')].some(n=>new RegExp(`\\b${escape(n)}\\b`,'i').test(text)));
  return {fulfillment,branch_id:named?.id??fallback?.branch_id??all[0].id};
}

// ---- Request state ------------------------------------------------------------------------------

const identity=({sku,description,pack,category_name}:ItemCandidate):ItemCandidate=>({sku,description,pack,category_name});

function openLine(line:ItemSearchLine,round:number,{requested_text=line.requested_text,qty}:{requested_text?:string;qty?:number}={}):ClarifyLine{
  return {requested_text,qty:qty??line.qty??1,question:line.question??NO_MATCH_QUESTION,round,candidates:line.candidates.map(identity),choices:[],text:withoutQty(line.requested_text)};
}

/** What a reply did to one open line (by its index in `open`). */
export type LineOutcome=
  |{kind:'match';index:number;sku:string;qty?:number}
  |{kind:'drop';index:number}
  /** Still not confident: the line's question and candidates are now these. */
  |{kind:'refine';index:number;line:ItemSearchLine;qty?:number};

/**
 * The request after a customer reply: `outcomes` for its open lines, `added` for lines the reply
 * asked for on top (confident ones are matched, the rest open in round 1), and `where` for a new
 * pickup/delivery choice. Rounds move as described at the top of this file.
 */
export function advance(state:ClarifyPayload,outcomes:readonly LineOutcome[],{added=[],where}:{added?:readonly ItemSearchLine[];where?:Where}={}):ClarifyPayload{
  const settled=outcomes.some(o=>o.kind!=='refine');
  const byLine=new Map(outcomes.map(o=>[o.index,o]));
  const next:ClarifyPayload={open:[],cart:{...state.cart,...where,lines:[...state.cart.lines]},dropped:[...state.dropped],rep:null};
  state.open.forEach((line,index)=>{
    const outcome=byLine.get(index);
    const round=settled?line.round:line.round+1;
    if(outcome?.kind==='match')next.cart.lines.push({sku:outcome.sku,qty:outcome.qty??line.qty,requested_text:line.requested_text});
    else if(outcome?.kind==='drop')next.dropped.push({requested_text:line.requested_text,qty:line.qty});
    else if(outcome?.kind==='refine')next.open.push(openLine(outcome.line,round,{requested_text:line.requested_text,qty:outcome.qty??line.qty}));
    else next.open.push({...line,round,choices:[]});
  });
  for(const line of added){
    if(line.confident&&line.candidates[0])next.cart.lines.push({sku:line.candidates[0].sku,qty:line.qty??1,requested_text:line.requested_text});
    else next.open.push(openLine(line,1));
  }
  return next;
}

/** A new request from search_items (one result line per requested line): confident lines are matched, the rest open in round 1. */
export function startRequest(lines:readonly ItemSearchLine[],where:Where):ClarifyPayload{
  return advance({open:[],cart:{...where,lines:[]},dropped:[],rep:null},[],{added:lines});
}

/**
 * How a new search_items result continues an open request (live chat, where Claude searches again
 * with the customer's answer). A result line continues the open line whose candidates share the most
 * SKUs with it: a confident one matches that line, another refines it. A confident line for a SKU
 * already in the cart is a repeat; anything else is a line the customer added.
 */
export function continueWith(state:ClarifyPayload,lines:readonly ItemSearchLine[]){
  const outcomes:LineOutcome[]=[],added:ItemSearchLine[]=[],used=new Set<number>();
  for(const line of lines){
    const top=line.candidates[0]?.sku;
    const skus=new Set(line.confident&&top?[top]:line.candidates.map(c=>c.sku));
    let index=-1,best=0;
    state.open.forEach((open,i)=>{
      if(used.has(i))return;
      const shared=open.candidates.filter(c=>skus.has(c.sku)).length;
      if(shared>best){best=shared;index=i;}
    });
    const qty=line.qty??undefined;
    if(index>=0){
      used.add(index);
      outcomes.push(line.confident&&top?{kind:'match',index,sku:top,qty}:{kind:'refine',index,line,qty});
    }else if(!(line.confident&&top&&state.cart.lines.some(l=>l.sku===top)))added.push(line);
  }
  return {outcomes,added};
}

/** The payload as the customer sees it: from round 2 a line's top candidates are buttons, and the rep's contact is shown. */
export function present(ctx:ToolContext,state:ClarifyPayload):ClarifyPayload{
  const open=state.open.map(line=>({...line,choices:line.round>=CANDIDATE_ROUND?line.candidates.slice(0,CANDIDATE_BUTTONS):[]}));
  const rep=open.some(line=>line.round>=CANDIDATE_ROUND)?repContact(ctx.customerId):null;
  return {...state,open,rep};
}

function repContact(customerId:string):ClarifyRep|null{
  const rep=assignedRep(customerId);
  return rep?{name:rep.name,initials:rep.initials,title:rep.title,phone:rep.phone,email:rep.email}:null;
}

/** The open request in a conversation: the last assistant message, when it is a clarifying reply. */
export function pendingRequest(history:readonly {role:string;kind?:string;payload?:unknown}[]):ClarifyPayload|undefined{
  const last=history.findLast(m=>m.role==='assistant');
  const payload=last?.kind==='clarify'?last.payload as Partial<ClarifyPayload>|null:undefined;
  // A clarify payload from before this shape (task 2.1) has no `open` lines: it is not resumed.
  return payload&&Array.isArray(payload.open)&&payload.cart?payload as ClarifyPayload:undefined;
}

// ---- Button replies: pick a candidate, drop a line -----------------------------------------------

/** The message a candidate button sends. */
export const pickMessage=(candidate:ItemCandidate)=>`${candidate.sku} (${candidate.description})`;
/** The message a Drop button sends. */
export const dropMessage=(line:{requested_text:string})=>`Drop ${quoted(line.requested_text)}`;

const DROP=/^\s*(?:please\s+)?(?:drop|remove|skip|forget(?:\s+about)?|cancel|delete)\b\s*(.*)$/i;
const THIS_LINE=/^(?:it|that|this|them|line|item|one)?$/;
const mentionsSku=(text:string,sku:string)=>new RegExp(`(?<![A-Z0-9-])${escape(sku)}(?![A-Z0-9-])`,'i').test(text);

/** The open line a drop message names: its words, or any drop when only one line is open. */
function dropTarget(text:string,state:ClarifyPayload){
  const said=DROP.exec(text)?.[1];
  if(said===undefined)return undefined;
  const rest=said.replace(/[“”"'.!]/g,'').trim().replace(/^(?:the|that|this)\s+/i,'').replace(/\s+(?:line|item|ones?)$/i,'').trim().toLowerCase();
  if(THIS_LINE.test(rest))return state.open.length===1?0:undefined;
  const exact=state.open.findIndex(l=>l.requested_text.toLowerCase()===rest);
  if(exact>=0)return exact;
  const hits=state.open.flatMap((line,i)=>{const own=lineName(line).toLowerCase();return own.includes(rest)||rest.includes(own)?[i]:[];});
  return hits.length===1?hits[0]:undefined;
}

/** A qty the customer states in a reply ("Type 1, 8 boxes"); a button's description in parentheses never counts. */
export function statedQty(text:string){
  const n=Number(UNIT_QTY.exec(text.replace(/\([^)]*\)/g,' '))?.[1]);
  return Number.isInteger(n)&&n>0?n:undefined;
}

/**
 * Settles what a reply says about the open lines without reading any language: a drop message drops
 * the line it names, and a candidate's SKU picks it for the line it belongs to. [] when the reply is
 * neither (so the engine reads it as an answer).
 */
export function readAction(text:string,state:ClarifyPayload):LineOutcome[]{
  const drop=dropTarget(text,state);
  if(drop!==undefined)return [{kind:'drop',index:drop}];
  const taken=new Set<string>(),picks:Extract<LineOutcome,{kind:'match'}>[]=[];
  state.open.forEach((line,index)=>{
    const named=line.candidates.filter(c=>!taken.has(c.sku)&&mentionsSku(text,c.sku));
    if(named.length===1){taken.add(named[0].sku);picks.push({kind:'match',index,sku:named[0].sku});}
  });
  const qty=statedQty(text);
  return picks.length===1&&qty?[{...picks[0],qty}]:picks;
}

// ---- Replies --------------------------------------------------------------------------------------

/** Items & stock is off for this customer: no item matching in chat, so point to the rep. */
export function itemsDenied(ctx:ToolContext,toolCalls:string[]):ChatReply{
  return reply({content:`I can't look up items in chat for your account. ${repHelp(ctx.customerId,'{rep} can take your order')}`,categories:ITEMS,toolCalls,outcome:'restricted'});
}

/** The item pop-up (spec §3) for a cart whose every line is matched, through propose_cart. */
export function itemPopupReply(ctx:ToolContext,cart:ItemPopupPayload,{toolCalls=[],lead}:{toolCalls?:string[];lead?:string}={}):ChatReply{
  const calls=[...toolCalls,'propose_cart'];
  const result=proposeCartTool(ctx,cart);
  if(!result.ok&&result.reason==='restricted')return itemsDenied(ctx,calls);
  if(!result.ok)return reply({content:`I couldn't build your list. ${repHelp(ctx.customerId,'{rep} can help')}`,categories:ITEMS,toolCalls:calls,outcome:'no_rows'});
  const payload=result.data;
  const branch=branches().find(b=>b.id===payload.branch_id)!;
  const where=payload.fulfillment==='will_call'?`Pickup at ${branch.code}`:`Delivery from ${branch.code}`;
  return reply({
    kind:'item_popup',payload,categories:ITEMS,handled:ITEMS,toolCalls:calls,rowCount:payload.lines.length,
    content:`${lead?`${lead}\n\n`:''}Here is your list:\n\n${payload.lines.map(l=>`- ${describeLine(l)}`).join('\n')}\n\n${where}. Check the quantities, choose pickup or delivery, then press Request quote.`,
  });
}

/** What changed since the last reply: the lines just matched and just dropped. */
function news(before:ClarifyPayload|undefined,after:ClarifyPayload){
  const parts:string[]=[];
  const matched=after.cart.lines.slice(before?.cart.lines.length??0);
  const dropped=after.dropped.slice(before?.dropped.length??0);
  if(matched.length)parts.push(`Got it: ${joinAnd(matched.map(describeLine))}.`);
  if(dropped.length)parts.push(`Dropped ${joinAnd(dropped.map(d=>quoted(d.requested_text)))}.`);
  return parts;
}

/** A clarifying reply's text: what changed, then each open line's question; from round 2, where the buttons and the rep are. */
export function clarifyText(before:ClarifyPayload|undefined,after:ClarifyPayload){
  const parts=news(before,after);
  const later=after.open.some(l=>l.round>=CANDIDATE_ROUND);
  if(after.open.length===1){
    const [line]=after.open;
    parts.push(line.round>=CANDIDATE_ROUND?`I still need to know which ${lineName(line)} you mean. ${line.question}`:line.question);
  }else{
    parts.push(`${later?'I still need':'I need'} a detail on ${after.open.length} lines:\n\n${after.open.map(l=>`- ${l.requested_text}: ${l.question}`).join('\n')}`);
  }
  if(later)parts.push(`${after.open.length>1?'Choose below, or drop a line you can\'t settle':'Choose one below, or drop the line'}. Not sure? ${after.rep?`Call ${after.rep.name}.`:'Customer Service can help.'}`);
  return parts.join('\n\n');
}

export interface RequestReplyOptions {
  /** Tools run for this reply, and the rows they returned. */
  toolCalls?:string[];rowCount?:number;
  /** Categories the turn asked about and answered besides Items & stock (live chat). */
  categories?:Category[];handled?:Category[];
  /** The text to show instead of clarifyText (Claude's words, in live chat). */
  content?:string;
}

/**
 * The reply for a request after a turn: a clarifying reply while any line is open, the item pop-up
 * once every line is matched, or a note when the customer dropped every line.
 */
export function requestReply(ctx:ToolContext,before:ClarifyPayload|undefined,after:ClarifyPayload,{toolCalls=[],rowCount=0,categories=[],handled=[],content}:RequestReplyOptions={}):ChatReply{
  if(!after.open.length&&after.cart.lines.length)return itemPopupReply(ctx,after.cart,{toolCalls,lead:news(before,after).filter(p=>p.startsWith('Dropped')).join('\n\n')||undefined});
  if(!after.open.length)return reply({
    content:`${news(before,after).join('\n\n')} That leaves nothing to quote: tell me what you need. ${repHelp(ctx.customerId,'{rep} can help too')}`.trim(),
    categories:unique([...ITEMS,...categories]),handled:unique([...ITEMS,...handled]),toolCalls,rowCount,
  });
  const payload=present(ctx,after);
  return reply({
    kind:'clarify',payload,content:content||clarifyText(before,payload),
    categories:unique([...ITEMS,...categories]),handled:unique([...ITEMS,...handled]),toolCalls,rowCount,
  });
}

/** The open request as a note for Claude (live chat): matched, open and dropped lines, and how to continue it. */
export function requestNote(state:ClarifyPayload){
  return [
    'Open quote request. Querent tracks it line by line; from round 2 the customer sees each open line\'s top candidates as buttons and the rep\'s contact.',
    ...state.cart.lines.map(l=>`- Matched: ${l.qty} × ${l.sku}${l.requested_text?` (${quoted(l.requested_text)})`:''}`),
    ...state.open.map(l=>`- Open, round ${l.round}: ${quoted(l.requested_text)}, qty ${l.qty}. Asked: ${quoted(l.question)} Candidates: ${l.candidates.map(c=>c.sku).join(', ')||'none'}.`),
    ...state.dropped.map(d=>`- Dropped: ${quoted(d.requested_text)}`),
    'If the customer\'s message answers an open line, call search_items with quote_request: true and every line still wanted: matched lines as their SKU and qty, open lines in the customer\'s words plus their answer. Once every line is matched, call propose_cart.',
  ].join('\n');
}
