import 'server-only';
import type {Branch,CartLine,ChatMessage,ChatReplyKind,ClarifyPayload,Fulfillment,ItemCandidate,ItemPopupPayload} from '@/domain';
import type {Category,ChatAnswer} from '@/lib/contracts';
import {assignedRep,branches,catalogItem} from '@/server/repository/customer';
import {getStockTool,proposeCartTool,searchItemsTool,type ItemStockAnswer,type ToolContext} from './tools';

// Scripted chat (spec §6.5): a deterministic Dana conversation that needs no API key. CI and every
// E2E run use it. The script knows a few phrasings; the data behind every answer comes from the
// same chat tools live chat uses, so stock, SKUs and access toggles are real.
//
//   Dana: Do you have 1/2 in grade 8 hex bolts in stock?        -> stock at every branch (get_stock)
//   Dana: Please quote 10 boxes of the 1/2 in grade 8 hex bolts
//         and 6 boxes of cut-off wheels. We'll pick up at SLC.  -> bolts matched; the wheels are vague:
//                                                                  "Type 1 or Type 27 cut-off wheels?" (search_items)
//   Dana: Type 1                                                 -> the item pop-up's cart (propose_cart)
//
// Anything off-script gets a short note that points to the customer's rep.

export interface ChatReply {
  kind:ChatReplyKind;
  /** Markdown shown in the chat bubble. */
  content:string;
  payload:ClarifyPayload|ItemPopupPayload|null;
  /** Information categories the message asked about, and those actually answered. */
  categories:Category[];
  handled:Category[];
  toolCalls:string[];
  rowCount:number;
  outcome:ChatAnswer['outcome'];
}

interface ScriptItem {
  /** How Querent names the item in a reply, e.g. "which cut-off wheels you mean". */
  name:string;
  mention:RegExp;
  /** A line Querent matches outright: the SKU Dana usually orders. */
  sku?:string;
  /** A vague line: the search that finds the candidates, the question, and how an answer picks one. */
  vague?:{query:string;question:string;choices:{sku:string;pattern:RegExp}[]};
}

const SCRIPT:ScriptItem[]=[
  {name:'hex bolts',mention:/\bhex\s+(?:bolts?|cap\s+screws?)\b|\bcap\s+screws?\b|\bbolts?\b/i,sku:'HCS-12-13-2G8'},
  {name:'cut-off wheels',mention:/\bcut[\s-]?off(?:\s+(?:wheels?|discs?))?\b/i,vague:{
    query:'4.5 cut-off wheel .045',
    question:'Type 1 or Type 27 cut-off wheels?',
    choices:[
      {sku:'CW-45-045-T1',pattern:/\b(?:type|t)[\s-]*1(?![\d/.])|^\W*(?:the\s+)?1s?\W*$/i},
      {sku:'CW-45-045-T27',pattern:/\b(?:type|t)[\s-]*27(?![\d/.])|^\W*(?:the\s+)?27s?\W*$/i},
    ],
  }},
];

const REQUEST=/\b(?:need|want|order|quote|send|request|buy|get\s+(?:me|us)|pick\s*up|deliver(?:y|ed)?|ship)\b/i;
const DELIVERY=/\bdeliver(?:y|ed)?\b|\bship(?:ped|ping)?\b/i;
const UNIT_QTY=/(?<![\d/.-])(\d{1,4})\s*(?:boxes|box|bx|cases?|cs|packs?|pk|each|ea|pcs|pieces|rolls?|pairs?|units?)\b/i;
const LEADING_QTY=/^(?:(?:please|can\s+you|could\s+you|i|we|i'd|we'd|like|would|need|want|order|quote|send|get|me|us|also)\s+)*(\d{1,4})(?![\d/.-])/i;
/** Clause breaks: punctuation (not a decimal point), and "and" / "plus" / "also" / "then". */
const CLAUSE=/[,;!?]|\.(?!\d)|\b(?:and|plus|also|then)\b/i;

const clauses=(text:string)=>text.split(CLAUSE).map(c=>c.trim()).filter(Boolean);
const count=(n:number)=>n>0?n:undefined;
/** A qty stated in the clause: "10 boxes", or a leading number ("6 cut-off wheels"). "1/2 in" is a size, not a qty. */
function qtyIn(clause:string){
  const unit=UNIT_QTY.exec(clause)?.[1]??LEADING_QTY.exec(clause)?.[1];
  return unit===undefined?undefined:count(Number(unit));
}
const joinAnd=(parts:string[])=>parts.length<2?parts.join(''):`${parts.slice(0,-1).join(', ')} and ${parts.at(-1)}`;
const label=(item:{sku:string;description:string;pack:string})=>`${item.sku} (${item.description}, ${item.pack.toLowerCase()})`;
const shortDate=(day:string)=>new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});

function repHelp(ctx:ToolContext,lead:string){
  const rep=assignedRep(ctx.customerId);
  return rep?`${lead.replace('{rep}',rep.name)}: ${rep.phone} or ${rep.email}.`:'Herrick customer service can help.';
}

/** A reply with defaults: plain text, answered, no categories, tools or payload. */
export const reply=(r:Partial<ChatReply>&Pick<ChatReply,'content'>):ChatReply=>({kind:'text',payload:null,categories:[],handled:[],toolCalls:[],rowCount:0,outcome:'answered',...r});

/** A choice picks a candidate when exactly one choice (or one candidate SKU) matches the text. */
function pick(text:string,candidates:ItemCandidate[],item?:ScriptItem){
  const upper=text.toUpperCase();
  const skus=new Set([
    ...(item?.vague?.choices??[]).filter(c=>c.pattern.test(text)).map(c=>c.sku),
    ...candidates.filter(c=>upper.includes(c.sku)).map(c=>c.sku),
  ]);
  return skus.size===1?candidates.find(c=>skus.has(c.sku)):undefined;
}

// ---- Stock answer ----------------------------------------------------------------------------

function stockLine(item:ItemStockAnswer){
  if(item.total_available>0)return joinAnd(item.branches.map(b=>`${b.available} at ${b.branch_code}`));
  const next=item.branches.filter(b=>b.on_order>0&&b.next_receipt_on).sort((a,b)=>a.next_receipt_on!.localeCompare(b.next_receipt_on!))[0];
  return `none in stock right now${next?`; more is due at ${next.branch_code} on ${shortDate(next.next_receipt_on!)}`:''}`;
}

function stockAnswer(ctx:ToolContext,skus:string[]):ChatReply{
  const result=getStockTool(ctx,{skus});
  if(!result.ok){
    const content=result.reason==='restricted'
      ?`Stock levels aren't available in chat for your account. ${repHelp(ctx,'{rep} can check for you')}`
      :`I couldn't look that up. ${repHelp(ctx,'{rep} can help')}`;
    return reply({content,categories:['items_stock'],toolCalls:['get_stock'],outcome:result.reason==='restricted'?'restricted':'no_rows'});
  }
  const {items}=result.data;
  const content=items.length===1
    ?items[0].total_available>0?`Yes. ${label(items[0])} is in stock: ${stockLine(items[0])}.`:`${label(items[0])}: ${stockLine(items[0])}.`
    :`Here's what we have:\n\n${items.map(i=>`- ${label(i)}: ${stockLine(i)}`).join('\n')}`;
  return reply({content,categories:['items_stock'],handled:['items_stock'],toolCalls:['get_stock'],rowCount:items.length});
}

// ---- Quote request, clarification and the item pop-up ----------------------------------------

function fulfillmentIn(text:string,all:Branch[],fallback?:ItemPopupPayload){
  const fulfillment:Fulfillment=DELIVERY.test(text)?'delivery':fallback?.fulfillment??'will_call';
  const named=all.find(b=>[b.code,b.name,b.city,b.city.replace(/\s+city$/i,'')].some(n=>new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text)));
  return {fulfillment,branch_id:named?.id??fallback?.branch_id??all[0].id};
}

function describeLine(line:CartLine){const item=catalogItem(line.sku);return `${line.qty} × ${item?label(item):line.sku}`;}

function itemPopup(ctx:ToolContext,cart:ItemPopupPayload,toolCalls:string[]):ChatReply{
  const result=proposeCartTool(ctx,cart);
  if(!result.ok)return reply({content:`I couldn't build your list. ${repHelp(ctx,'{rep} can help')}`,toolCalls:[...toolCalls,'propose_cart'],outcome:'no_rows'});
  const payload=result.data;
  const branch=branches().find(b=>b.id===payload.branch_id)!;
  const where=payload.fulfillment==='will_call'?`Pickup at ${branch.code}`:`Delivery from ${branch.code}`;
  return reply({
    kind:'item_popup',payload,toolCalls:[...toolCalls,'propose_cart'],rowCount:payload.lines.length,
    content:`Here is your list:\n\n${payload.lines.map(l=>`- ${describeLine(l)}`).join('\n')}\n\n${where}. Check the quantities, choose pickup or delivery, then press Request quote.`,
  });
}

function clarify(ctx:ToolContext,payload:ClarifyPayload,toolCalls:string[]):ChatReply{
  const {question,round,line,cart}=payload;
  const name=SCRIPT.find(i=>i.vague?.question===question)?.name??'item';
  const content=round<2
    ?`${cart.lines.length?`Got it: ${joinAnd(cart.lines.map(describeLine))}.\n\n`:''}${question}`
    :`I still need to know which ${name} you mean. ${question}\n\n${line.candidates.map(c=>`- ${label(c)}`).join('\n')}\n\nNot sure? ${repHelp(ctx,'{rep} can help')}`;
  return reply({kind:'clarify',payload,content,toolCalls,rowCount:line.candidates.length});
}

/** Dana asks for goods: match each scripted line, then ask about the first vague one or open the pop-up. */
function request(ctx:ToolContext,text:string,mentioned:ScriptItem[]):ChatReply{
  const parts=clauses(text);
  const toolCalls:string[]=[];
  const cart:ItemPopupPayload={...fulfillmentIn(text,branches()),lines:[]};
  let open:ClarifyPayload['line']|undefined,openItem:ScriptItem|undefined;
  for(const item of mentioned){
    const said=parts.filter(p=>item.mention.test(p));
    const requested_text=said.find(p=>qtyIn(p)!==undefined)??said[0]??item.name;
    const qty=said.map(qtyIn).find(q=>q!==undefined)??1;
    if(item.sku){cart.lines.push({sku:catalogItem(item.sku)?.sku??item.sku,qty,requested_text});continue;}
    const found=searchItemsTool(ctx,{query:item.vague!.query});
    toolCalls.push('search_items');
    const candidates=found.ok?found.data:[];
    const chosen=pick(said.join(' '),candidates,item);
    if(chosen)cart.lines.push({sku:chosen.sku,qty,requested_text});
    else if(!open){open={requested_text,qty,candidates};openItem=item;}
  }
  if(open&&openItem)return clarify(ctx,{question:openItem.vague!.question,round:1,line:open,cart},toolCalls);
  return itemPopup(ctx,cart,toolCalls);
}

/** Dana answers a clarifying question: resolve the line and open the pop-up, or ask again. */
function answer(ctx:ToolContext,text:string,pending:ClarifyPayload):ChatReply|undefined{
  const item=SCRIPT.find(i=>i.vague?.question===pending.question);
  const chosen=pick(text,pending.line.candidates,item);
  if(!chosen)return undefined;
  // Only an explicit "8 boxes" changes the qty: a bare "27" answers the question, it isn't a qty.
  const unit=UNIT_QTY.exec(text)?.[1];
  const qty=(unit===undefined?undefined:count(Number(unit)))??pending.line.qty;
  const line:CartLine={sku:chosen.sku,qty,requested_text:pending.line.requested_text};
  return itemPopup(ctx,{...pending.cart,...fulfillmentIn(text,branches(),pending.cart),lines:[...pending.cart.lines,line]},[]);
}

/**
 * The scripted reply to `message`, given the conversation so far (oldest first). The state of an
 * open clarification lives in the last assistant message's `clarify` payload.
 */
export function scriptedReply(ctx:ToolContext,message:string,history:Pick<ChatMessage,'role'|'kind'|'payload'>[]):ChatReply{
  const text=message.trim();
  const last=history.findLast(m=>m.role==='assistant');
  const pending=last?.kind==='clarify'?last.payload as ClarifyPayload:undefined;
  if(pending){const resolved=answer(ctx,text,pending);if(resolved)return resolved;}
  const mentioned=SCRIPT.filter(item=>item.mention.test(text));
  if(mentioned.length&&(REQUEST.test(text)||UNIT_QTY.test(text)))return request(ctx,text,mentioned);
  if(mentioned.length){
    const skus=mentioned.flatMap(item=>{
      if(item.sku)return [item.sku];
      const chosen=item.vague!.choices.filter(c=>c.pattern.test(text));
      return chosen.length===1?[chosen[0].sku]:item.vague!.choices.map(c=>c.sku);
    });
    return stockAnswer(ctx,skus);
  }
  if(pending)return clarify(ctx,{...pending,round:pending.round+1},[]);
  return reply({
    outcome:'no_rows',
    content:`I'm running as a scripted demo, so I can only follow the sample conversation: ask whether the 1/2 in grade 8 hex bolts are in stock, then ask for bolts and cut-off wheels to start a quote. ${repHelp(ctx,'For anything else, {rep} can help')}`,
  });
}
