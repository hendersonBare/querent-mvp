import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type {ChatMessage,ItemPopupPayload} from '@/domain';
import {labels} from '@/lib/contracts';
import {accountSummary,assignedRep,branches,supplier} from '@/server/repository/customer';
import {advance,continueWith,itemsDenied,pendingRequest,readAction,requestNote,requestReply,startRequest,whereIn} from './clarify';
import {TOOL_DEFINITIONS,runTool,type ToolRun} from './definitions';
import {chatModel} from './mode';
import {reply,repHelp,type ChatReply} from './reply';
import {toolDenied,type ItemSearchResult,type ToolContext} from './tools';

// Live chat (spec §3, §6.3, task 2.1): Claude answers the customer through typed tools over the
// customer-safe repository, never generated SQL. A manual tool-use loop, so every call is recorded
// for the query log: the categories asked about (each tool's access toggle), which were answered,
// the row count, and the item pop-up's cart when propose_cart succeeds. Access toggles are
// enforced inside the tools, not by the prompt, so Claude cannot talk its way past them.
//
// Quote requests run through the clarification loop (./clarify.ts, task 2.2). Claude marks the
// searches that belong to a quote request (search_items quote_request); after its turn the last
// one becomes, or continues, the request's line-by-line state, which the reply carries as a
// `clarify` payload while any line is open. Button replies (a candidate's SKU, Drop) are settled
// on the server without Claude, and Claude is shown the open request with every later message.

/** The part of the Anthropic client live chat uses; tests pass a fake. */
export interface LiveClient {
  messages:{create(body:Anthropic.MessageCreateParamsNonStreaming,options?:Anthropic.RequestOptions):PromiseLike<Anthropic.Message>};
}

export interface LiveOptions {
  client?:LiveClient;
  /** Defaults to ANTHROPIC_MODEL, else claude-sonnet-5. */
  model?:string;
  /** Today as YYYY-MM-DD, for the prompt. Defaults to the clock. */
  today?:string;
}

/** Claude may call tools this many times in one turn; the next request must answer in text. */
export const MAX_TOOL_ROUNDS=6;
/** Output budget per request, thinking included (adaptive thinking is on by default on the default model). */
export const MAX_TOKENS=16000;
/** Earlier messages sent with each question. */
export const HISTORY_LIMIT=20;

let shared:LiveClient|undefined;
/** One client per server process; the SDK reads ANTHROPIC_API_KEY. */
function defaultClient(){return shared??=new Anthropic({timeout:60_000,maxRetries:2});}

/** The system prompt: who Querent is, the rules, and this customer's rep and branches. Stable for a customer and day. */
export function systemPrompt(ctx:ToolContext,today:string){
  const company=supplier();
  const account=accountSummary(ctx.customerId);
  const rep=assignedRep(ctx.customerId);
  const branchList=branches().map(b=>`- ${b.id}: ${b.code} branch, ${b.address}, ${b.city}, ${b.state} (will-call ${b.will_call_phone})`).join('\n');
  return `You are Querent, the chat assistant for ${company.name}, a packaging supply distributor. You are chatting with a purchasing contact at ${account?`${account.name} (account ${account.account_number})`:'a customer'}.

How to answer:
- Answer only from tool results. Never guess a SKU, stock level, price, order detail or account fact. If the tools don't have it, say so.
- When the customer names goods, call search_items first, with every requested line in their words, one item per line. Use only SKUs it returns.
- Stock questions: search_items, then get_stock. Name items as "SKU (description, pack)", and give stock per branch.
- Quote requests: call search_items with quote_request: true and every requested line. If a line is not confident, ask its clarifying question (one short question per line, no guessing) and do not call propose_cart yet. Querent tracks each line: from the second round it shows the customer the line's top candidates as buttons and ${rep?.name??'the rep'}'s contact, so don't list them yourself; the customer may also drop a line. While a request is open you're shown its lines with each message: when the customer answers, call search_items with quote_request: true again with every line still wanted. When every line has a confident SKU, or one the customer picked from the candidates, call propose_cart with the SKUs, quantities, pickup or delivery, and the branch they named. Then tell them to check the list in the pop-up and press Request quote. You don't create quotes, and you never quote prices in a quote request: ${rep?.name??'their rep'} prices the quote.
- Prices come only from get_price (or the prices paid in get_order_history). A quote can differ from these prices.
- If a tool says an information category is restricted for this account, say plainly that it isn't available in chat, and give the rep's name, phone and email. Don't try another tool to get around it.
- You never have cost, margin or internal notes, and never speculate about them.
- Be brief and plain. Use a short Markdown list for several items. No preamble.

The customer's rep: ${rep?`${rep.name}, ${rep.title}, ${rep.phone}, ${rep.email}`:'none assigned; point them to customer service'}.
Branches (id: name):
${branchList}
Today is ${today}.`;
}

/** An earlier message: its text, and the kind and payload of a reply (an open request lives in a `clarify` payload). */
export type EarlierMessage=Pick<ChatMessage,'role'|'content'>&Partial<Pick<ChatMessage,'kind'|'payload'>>;

/** Earlier turns as Claude messages: text only, oldest first, starting with the customer. */
function historyParams(history:readonly EarlierMessage[]):Anthropic.MessageParam[]{
  const turns=history.filter(m=>(m.role==='customer'||m.role==='assistant')&&m.content.trim()).slice(-HISTORY_LIMIT);
  const first=turns.findIndex(m=>m.role==='customer');
  return first<0?[]:turns.slice(first).map(m=>({role:m.role==='customer'?'user':'assistant',content:m.content}));
}

const textOf=(message:Anthropic.Message)=>message.content.flatMap(b=>b.type==='text'?[b.text]:[]).join('\n\n').trim();
const unique=<T>(values:T[])=>[...new Set(values)];

/** What a tool call gives back to Claude: the data, or why there is none. */
function toolResult(id:string,call:ToolRun,repContact:string):Anthropic.ToolResultBlockParam{
  const {result}=call;
  if(result.ok)return {type:'tool_result',tool_use_id:id,content:JSON.stringify(result.data)};
  if(result.reason==='restricted')return {type:'tool_result',tool_use_id:id,content:JSON.stringify({
    restricted:result.category,message:`This account can't get ${labels[result.category]} information in chat. Tell the customer it isn't available here and that ${repContact}`,
  })};
  return {type:'tool_result',tool_use_id:id,is_error:true,content:result.message};
}

/** The quote_request flag Claude set on a search_items call. */
const isQuoteRequest=(input:unknown)=>typeof input==='object'&&input!==null&&(input as {quote_request?:unknown}).quote_request===true;

/**
 * Claude's reply to `message`, given the conversation so far (oldest first). Runs Claude's tool
 * calls until it answers in text, at most MAX_TOOL_ROUNDS rounds. A button reply to an open
 * request (a candidate's SKU, or Drop) is settled without calling Claude.
 */
export async function liveReply(ctx:ToolContext,message:string,history:readonly EarlierMessage[],options:LiveOptions={}):Promise<ChatReply>{
  const today=options.today??ctx.today??new Date().toISOString().slice(0,10);
  const toolCtx:ToolContext={...ctx,today};
  const pending=pendingRequest(history);
  if(pending){
    const outcomes=readAction(message,pending);
    if(outcomes.length){
      if(toolDenied(toolCtx,'search_items'))return itemsDenied(ctx,['search_items']);
      return requestReply(toolCtx,pending,advance(pending,outcomes,{where:whereIn(message,pending.cart)}));
    }
  }
  const client=options.client??defaultClient();
  const model=options.model??chatModel();
  const system=systemPrompt(ctx,today);
  const repContact=repHelp(ctx.customerId,'{rep} can help');
  const said:Anthropic.MessageParam['content']=pending?[{type:'text',text:requestNote(pending)},{type:'text',text:message}]:message;
  const messages:Anthropic.MessageParam[]=[...historyParams(history),{role:'user',content:said}];
  const calls:ToolRun[]=[];
  const quoteSearches:ItemSearchResult[]=[];
  let popup:ItemPopupPayload|null=null;

  for(let round=0;;round++){
    const last=round>=MAX_TOOL_ROUNDS;
    const response=await client.messages.create({
      model,max_tokens:MAX_TOKENS,messages,tools:TOOL_DEFINITIONS,
      system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],
      ...(last?{tool_choice:{type:'none'}}:{}),
    });
    const uses=response.content.filter((b):b is Anthropic.ToolUseBlock=>b.type==='tool_use');
    if(response.stop_reason!=='tool_use'||!uses.length||last)return finish(response);
    messages.push({role:'assistant',content:response.content});
    messages.push({role:'user',content:uses.map(use=>{
      const call=runTool(toolCtx,use.name,use.input);
      calls.push(call);
      if(call.name==='propose_cart'&&call.result.ok)popup=call.result.data as ItemPopupPayload;
      if(call.name==='search_items'&&call.result.ok&&isQuoteRequest(use.input))quoteSearches.push(call.result.data as ItemSearchResult);
      return toolResult(use.id,call,repContact);
    })});
  }

  function finish(response:Anthropic.Message):ChatReply{
    const categories=unique(calls.flatMap(c=>c.categories));
    const handled=unique(calls.flatMap(c=>c.result.ok?c.categories:[]));
    const restricted=calls.some(c=>!c.result.ok&&c.result.reason==='restricted');
    const rowCount=calls.reduce((n,c)=>n+c.rows,0);
    const base={categories,handled,rowCount,toolCalls:calls.map(c=>c.name??'unknown')};
    if(response.stop_reason==='refusal')return reply({...base,handled:[],outcome:'no_rows',content:`I can't help with that in chat. ${repHelp(ctx.customerId,'{rep} can help')}`});
    const text=textOf(response);
    if(popup)return reply({...base,kind:'item_popup',payload:popup,outcome:'answered',
      content:text||'Here is your list. Check the quantities, choose pickup or delivery, then press Request quote.'});
    const request=requestAfter();
    if(request?.open.length)return requestReply(toolCtx,pending,request,{...base,content:text||undefined});
    const outcome:ChatReply['outcome']=restricted&&!handled.length?'restricted':calls.length&&!rowCount&&!restricted?'no_rows':'answered';
    return reply({...base,outcome,content:text||`I couldn't answer that. ${repHelp(ctx.customerId,'{rep} can help')}`});
  }

  /**
   * The request after Claude's turn: the last quote_request search starts one, or continues the
   * open one (a turn with no such search settles no line, so the open lines move to the next round).
   */
  function requestAfter(){
    if(toolDenied(toolCtx,'search_items'))return undefined;
    const search=quoteSearches.at(-1);
    if(pending){
      const {outcomes,added}=continueWith(pending,search?.lines??[]);
      return advance(pending,outcomes,{added,where:whereIn(message,pending.cart)});
    }
    return search&&startRequest(search.lines,whereIn(message));
  }
}
