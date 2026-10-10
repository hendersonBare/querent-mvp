import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {z} from 'zod';
import {chatMode,chatModel} from '@/server/chat/mode';
import {costKeys,type ChipFacts,type ChipWording,type ChipWriter} from './facts';

// Claude writes the "Suggested by Querent" chip wording in live mode (spec §5.5, §6.5; task 3.6).
// The rules (task 1.6) decide every chip; Claude only words it, from the cost-free facts in
// ./facts (the rep service strips cost, price and GP first, and this refuses anything that looks
// like them). One request per batch of chips, answered through one tool so the wording comes
// back per chip id. It is quick or it is skipped: a short timeout, no retries, and after a
// failure a pause before trying again. Whatever Claude doesn't word well keeps the template.

/** The part of the Anthropic client the writer uses; tests pass a fake. */
export interface WriterClient {
  messages:{create(body:Anthropic.MessageCreateParamsNonStreaming,options?:Anthropic.RequestOptions):PromiseLike<Anthropic.Message>};
}

/** A request that takes longer is dropped, and the chips keep their template wording. */
export const WRITER_TIMEOUT_MS=8_000;
/** Output budget, thinking included (adaptive thinking is on by default on the default model). */
export const WRITER_MAX_TOKENS=4_000;
/** After a failed request, Claude isn't asked again for this long (the templates stand in). */
export const WRITER_BACKOFF_MS=60_000;
/** Wordings kept, by chip facts and model, so a page reload or an edit elsewhere doesn't ask again. */
export const WRITER_CACHE_SIZE=500;
export const TITLE_MAX=90;
export const REASON_MAX=240;

export const WORDING_TOOL:Anthropic.Tool={
  name:'write_upsell_wording',
  description:'Records the wording for every suggestion, by its id.',
  input_schema:{
    type:'object',
    properties:{chips:{type:'array',items:{type:'object',additionalProperties:false,required:['id','title','reason'],properties:{
      id:{type:'string',description:'The suggestion id, exactly as given.'},
      title:{type:'string',description:`The headline, at most ${TITLE_MAX} characters.`},
      reason:{type:'string',description:`Why Querent suggests it: one or two short sentences, at most ${REASON_MAX} characters.`},
    }}}},
    required:['chips'],additionalProperties:false,
  },
};

export const SYSTEM_PROMPT=`You write the wording for "Suggested by Querent": upsell suggestions that an inside sales rep at an industrial supply distributor sees on a customer's quote draft. Fixed rules already chose each suggestion and its quantity; you only word them.

For each suggestion, write:
- title: what to add or change, at most ${TITLE_MAX} characters. For an item to add, start with the item as described, with its size, grade and pack (e.g. "Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)"). For a full_case suggestion, say the bump (e.g. "Bump cut-off wheels to 8 boxes (2 full cases)").
- reason: why, in one or two short sentences, at most ${REASON_MAX} characters, using only the facts given: the bolt it matches, the case quantity, or how many of the customer's orders had both items over the history window.

Rules:
- Use only the facts given. Keep every number and item detail exactly as given; don't round, rename or invent anything.
- Never mention or guess a price, cost, margin, profit, discount or saving, and never write "$" or "%": you aren't given any of them.
- Plain and specific, for a busy rep. No hype, no exclamation marks, no emoji.
- The template is correct wording for the same facts. Improve how it reads, or keep it.

Call ${WORDING_TOOL.name} once, with every suggestion id.`;

const Output=z.object({chips:z.array(z.object({id:z.string(),title:z.string(),reason:z.string()}).loose())}).loose();

/** Words Claude may not use: it never sees a price, cost or margin, so any mention would be made up. */
const MADE_UP=/[$%¢€£]|\b(cost|costs|margin|margins|profit|profits|discount|discounted|price|prices|priced|pricing|cheaper|savings?)\b/i;

/** Claude's wording, trimmed, if it is usable on a chip: within length, one line, and nothing about money. */
export function acceptableWording(text:{title:string;reason:string}):ChipWording|null{
  const title=text.title.trim(),reason=text.reason.trim();
  const ok=(value:string,max:number)=>value.length>=3&&value.length<=max&&!/[\r\n]/.test(value)&&!MADE_UP.test(value);
  return ok(title,TITLE_MAX)&&ok(reason,REASON_MAX)?{title,reason}:null;
}

/** JSON with object keys sorted, so equal facts give equal cache keys. */
function stableJson(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}

/** The wording per chip id from Claude's tool call; empty when it didn't call the tool as asked. */
export function wordingFrom(message:Anthropic.Message):Map<string,ChipWording>{
  const use=message.content.find((b):b is Anthropic.ToolUseBlock=>b.type==='tool_use'&&b.name===WORDING_TOOL.name);
  const parsed=use?Output.safeParse(use.input):null;
  const found=new Map<string,ChipWording>();
  for(const chip of parsed?.success?parsed.data.chips:[]){
    const wording=acceptableWording(chip);
    if(wording&&!found.has(chip.id))found.set(chip.id,wording);
  }
  return found;
}

export interface ClaudeWriterOptions {
  client?:WriterClient;
  /** Defaults to ANTHROPIC_MODEL, else claude-sonnet-5 (as live chat). */
  model?:string;
  timeoutMs?:number;
  /** The clock, for the pause after a failure. */
  now?:()=>number;
  /** Where failures are reported (console.warn by default). */
  warn?:(message:string)=>void;
}

let shared:WriterClient|undefined;
/** One client per server process; the SDK reads ANTHROPIC_API_KEY. */
// TODO(R-2): pass the key from user secrets or a secrets manager instead of .env.local.
function defaultClient(){return shared??=new Anthropic({timeout:WRITER_TIMEOUT_MS,maxRetries:0});}

/**
 * A ChipWriter backed by Claude. Chips it has worded before (same facts, same model) come from
 * its cache; the rest go to Claude in one request. A chip Claude leaves out or words badly, and
 * every chip while the writer is pausing after a failure, gets null: the caller keeps its template.
 */
export function claudeChipWriter({client,model=chatModel(),timeoutMs=WRITER_TIMEOUT_MS,now=Date.now,warn=message=>console.warn(message)}:ClaudeWriterOptions={}):ChipWriter{
  const cache=new Map<string,ChipWording>();
  let pausedUntil=0;
  const keyOf=(chip:ChipFacts)=>`${model}\u0000${stableJson(chip)}`;
  const remember=(key:string,wording:ChipWording)=>{
    cache.delete(key);
    cache.set(key,wording);
    if(cache.size>WRITER_CACHE_SIZE)cache.delete(cache.keys().next().value!);
  };

  return async chips=>{
    const leaked=costKeys(chips);
    if(leaked.length)throw new Error(`Chip facts for Claude may not carry cost, price or profit (${leaked.join(', ')}).`);
    const out:(ChipWording|null)[]=chips.map(chip=>{
      const key=keyOf(chip),hit=cache.get(key);
      if(hit)remember(key,hit);
      return hit??null;
    });
    const todo=chips.flatMap((chip,i)=>out[i]?[]:[{chip,i}]);
    if(!todo.length||now()<pausedUntil)return out;
    try{
      const response=await (client??defaultClient()).messages.create({
        model,max_tokens:WRITER_MAX_TOKENS,system:SYSTEM_PROMPT,tools:[WORDING_TOOL],
        tool_choice:{type:'auto',disable_parallel_tool_use:true},
        messages:[{role:'user',content:`Word these ${todo.length===1?'suggestion':`${todo.length} suggestions`}. The facts, as JSON:\n${JSON.stringify(todo.map(t=>t.chip))}`}],
      },{timeout:timeoutMs,maxRetries:0});
      const written=wordingFrom(response);
      for(const {chip,i} of todo){
        const wording=written.get(chip.id);
        if(wording){out[i]=wording;remember(keyOf(chip),wording);}
      }
    }catch(error){
      pausedUntil=now()+WRITER_BACKOFF_MS;
      warn(`Upsell wording: Claude failed, using the templates (${error instanceof Error?error.message:String(error)}).`);
    }
    return out;
  };
}

let live:ChipWriter|undefined;
/**
 * The writer for this server: Claude in live mode, and undefined in scripted mode (QUERENT_SCRIPTED=1
 * or no ANTHROPIC_API_KEY), where the chips keep their deterministic template wording (spec §6.5).
 */
export function upsellWriter(env:Record<string,string|undefined>=process.env):ChipWriter|undefined{
  if(chatMode(env)!=='live')return undefined;
  return live??=claudeChipWriter({model:chatModel(env)});
}
