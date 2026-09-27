import 'server-only';
import type {ChatMessage,ClarifyPayload} from '@/domain';
import {UNIT_QTY} from './lines';
import {reply,repHelp as help,type ChatReply} from './reply';
import {
  advance,itemLabel as label,itemsDenied,pendingRequest,readAction,requestReply,startRequest,statedQty,whereIn,type LineOutcome,
} from './clarify';
import {getStockTool,searchItemsTool,toolDenied,type ItemStockAnswer,type ToolContext} from './tools';

export {reply,type ChatReply} from './reply';

// Scripted chat (spec §6.5): a deterministic Dana conversation that needs no API key. CI and every
// E2E run use it. The script knows a few phrasings; the data behind every answer comes from the
// same chat tools live chat uses, so stock, SKUs and access toggles are real, and a quote request
// runs through the same clarification loop (./clarify.ts): each line Dana names is matched by
// search_items (the 1.4 matcher), never by a SKU the script picks.
//
//   Dana: Do you have 1/2 in grade 8 hex bolts in stock?        -> stock at every branch (get_stock)
//   Dana: Please quote 10 boxes of the 1/2 in grade 8 hex bolts
//         and 6 boxes of cut-off wheels. We'll pick up at SLC.  -> bolts matched; the wheels are vague:
//                                                                  "Type 1 or Type 27 cut-off wheels?" (round 1)
//   Dana: Not sure                                               -> round 2: the top 3 wheels as buttons,
//                                                                  Brandi's contact, and Drop this line
//   Dana: Type 1 (or presses a button)                           -> the item pop-up's cart (propose_cart)
//
// Anything off-script gets a short note that points to the customer's rep.

interface ScriptItem {
  mention:RegExp;
  /** Stock questions: the SKU a stock answer is about. */
  sku?:string;
  /**
   * An item Dana names without saying which: the SKU a stock answer covers for each way she can
   * narrow it (all of them when she doesn't), and the words a short answer ("27", "the 1s") stands for.
   */
  vague?:{choices:{sku:string;phrase:string;pattern:RegExp}[]};
}

const SCRIPT:ScriptItem[]=[
  {mention:/\bhex\s+(?:bolts?|cap\s+screws?)\b|\bcap\s+screws?\b|\bbolts?\b/i,sku:'HCS-12-13-2G8'},
  {mention:/\bcut[\s-]?off(?:\s+(?:wheels?|discs?))?\b/i,vague:{choices:[
    {sku:'CW-45-045-T1',phrase:'Type 1',pattern:/\b(?:type|t)[\s-]*1(?![\d/.])|^\W*(?:the\s+)?1s?\W*$/i},
    {sku:'CW-45-045-T27',phrase:'Type 27',pattern:/\b(?:type|t)[\s-]*27(?![\d/.])|^\W*(?:the\s+)?27s?\W*$/i},
  ]}},
];

const REQUEST=/\b(?:need|want|order|quote|send|request|buy|get\s+(?:me|us)|pick\s*up|deliver(?:y|ed)?|ship)\b/i;
/** Clause breaks: punctuation (not a decimal point), and "and" / "plus" / "also" / "then". */
const CLAUSE=/[,;!?]|\.(?!\d)|\b(?:and|plus|also|then)\b/i;

const clauses=(text:string)=>text.split(CLAUSE).map(c=>c.trim()).filter(Boolean);
const joinAnd=(parts:string[])=>parts.length<2?parts.join(''):`${parts.slice(0,-1).join(', ')} and ${parts.at(-1)}`;
const shortDate=(day:string)=>new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const rowsOf=(lines:{candidates:unknown[]}[])=>lines.reduce((n,l)=>n+l.candidates.length,0);

const repHelp=(ctx:ToolContext,lead:string)=>help(ctx.customerId,lead);

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

// ---- Quote request and the clarification loop (./clarify.ts) ----------------------------------

/** Dana asks for goods: search_items matches every line she names; then the pop-up, or a question for each open line. */
function request(ctx:ToolContext,text:string):ChatReply{
  const said=clauses(text).filter(clause=>SCRIPT.some(item=>item.mention.test(clause)));
  const toolCalls=['search_items'];
  const found=searchItemsTool(ctx,{query:said.join('\n')});
  if(!found.ok&&found.reason==='restricted')return itemsDenied(ctx,toolCalls);
  if(!found.ok||!found.data.lines.length)return reply({content:`I couldn't match that. ${repHelp(ctx,'{rep} can help')}`,categories:['items_stock'],toolCalls,outcome:'no_rows'});
  return requestReply(ctx,undefined,startRequest(found.data.lines,whereIn(text)),{toolCalls,rowCount:rowsOf(found.data.lines)});
}

/** The words an answer stands for: a short answer the script knows ("27" is "Type 27"), else the answer without its "8 boxes". */
function phraseOf(text:string){
  const known=SCRIPT.flatMap(item=>item.vague?.choices.filter(c=>c.pattern.test(text))??[]);
  return known.length===1?known[0].phrase:text.replace(UNIT_QTY,' ').trim();
}

/**
 * Dana replies while lines are open. A button (a candidate's SKU, or Drop) settles its line
 * directly. Otherwise each open line is searched again with her answer added, as Claude searches
 * again in live chat: a confident match among the line's candidates settles it, and a new question
 * about fewer of them narrows it. No reply when the message answers no line.
 */
function answer(ctx:ToolContext,text:string,pending:ClarifyPayload):{reply?:ChatReply;toolCalls:string[];rowCount:number}{
  const toolCalls:string[]=[];
  let rowCount=0;
  let outcomes=readAction(text,pending);
  if(!outcomes.length){
    const phrase=phraseOf(text);
    for(const [index,line] of pending.open.entries()){
      toolCalls.push('search_items');
      const found=searchItemsTool(ctx,{query:`${line.text} ${phrase}`});
      if(!found.ok&&found.reason==='restricted')return {reply:itemsDenied(ctx,toolCalls),toolCalls,rowCount};
      if(!found.ok||found.data.lines.length!==1)continue;
      const [again]=found.data.lines;
      rowCount+=again.candidates.length;
      const offered=new Set(line.candidates.map(c=>c.sku));
      if(!again.candidates[0]||!offered.has(again.candidates[0].sku))continue;
      if(again.confident)outcomes.push({kind:'match',index,sku:again.candidates[0].sku});
      else if(again.question!==line.question)outcomes.push({kind:'refine',index,line:{...again,candidates:again.candidates.filter(c=>offered.has(c.sku))}});
    }
    const qty=statedQty(text);
    if(outcomes.length===1&&qty)outcomes=[{...outcomes[0],qty} as LineOutcome];
  }
  if(!outcomes.length)return {toolCalls,rowCount};
  const next=advance(pending,outcomes,{where:whereIn(text,pending.cart)});
  return {reply:requestReply(ctx,pending,next,{toolCalls,rowCount}),toolCalls,rowCount};
}

/**
 * The scripted reply to `message`, given the conversation so far (oldest first). An open request
 * lives in the last assistant message's `clarify` payload.
 */
export function scriptedReply(ctx:ToolContext,message:string,history:Pick<ChatMessage,'role'|'kind'|'payload'>[]):ChatReply{
  const text=message.trim();
  const pending=pendingRequest(history);
  let tried:{toolCalls:string[];rowCount:number}|undefined;
  if(pending){
    if(toolDenied(ctx,'search_items'))return itemsDenied(ctx,['search_items']);
    const attempt=answer(ctx,text,pending);
    if(attempt.reply)return attempt.reply;
    tried=attempt;
  }
  const mentioned=SCRIPT.filter(item=>item.mention.test(text));
  if(mentioned.length&&(REQUEST.test(text)||UNIT_QTY.test(text)))return request(ctx,text);
  if(mentioned.length){
    const skus=mentioned.flatMap(item=>{
      if(item.sku)return [item.sku];
      const chosen=item.vague!.choices.filter(c=>c.pattern.test(text));
      return chosen.length===1?[chosen[0].sku]:item.vague!.choices.map(c=>c.sku);
    });
    return stockAnswer(ctx,skus);
  }
  // A reply that settles no open line: the next round (./clarify.ts).
  if(pending)return requestReply(ctx,pending,advance(pending,[]),tried);
  return reply({
    outcome:'no_rows',
    content:`I'm running as a scripted demo, so I can only follow the sample conversation: ask whether the 1/2 in grade 8 hex bolts are in stock, then ask for bolts and cut-off wheels to start a quote. ${repHelp(ctx,'For anything else, {rep} can help')}`,
  });
}
