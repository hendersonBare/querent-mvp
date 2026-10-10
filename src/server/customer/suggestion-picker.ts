import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {z} from 'zod';
import {chatMode,chatModel} from '@/server/chat/mode';
import {costKeys} from '@/server/upsells-writer/facts';
import type {PickerInput,SuggestionPick,SuggestionPicker} from './suggestions';

// Claude picks the item pop-up's "Frequently bought together" in live mode (decision 37, spec §10,
// task E1). The server builds the pool (./suggestions); Claude only chooses up to 3 from it and
// writes a short reason per pick, in the style of the rep's "Suggested by Querent" chips. Set up
// like the chip writer (src/server/upsells-writer/claude.ts): one request answered through one
// tool, cost-free facts only (refused otherwise), a short timeout, no retries, and after a failure a
// pause. Every pick is validated against the pool afterwards (validatePicks), so whatever Claude
// sends can never add an item that isn't in the pool. This is LLM code and customer-facing: it may
// import neither the internal repository nor anything that reads cost (boundary.test.ts).

/** The part of the Anthropic client the picker uses; tests pass a fake. */
export interface PickerClient {
  messages:{create(body:Anthropic.MessageCreateParamsNonStreaming,options?:Anthropic.RequestOptions):PromiseLike<Anthropic.Message>};
}

/** A request that takes longer is dropped, and the pop-up gets the scripted picks. */
export const PICKER_TIMEOUT_MS=8_000;
/** Output budget, thinking included. */
export const PICKER_MAX_TOKENS=4_000;
/** After a failed request, Claude isn't asked again for this long (the scripted picks stand in). */
export const PICKER_BACKOFF_MS=60_000;

export const PICK_TOOL:Anthropic.Tool={
  name:'pick_suggestions',
  description:'Records the suggestions to show the customer, best first, each with its reason.',
  input_schema:{
    type:'object',
    properties:{picks:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['sku','reason'],properties:{
      sku:{type:'string',description:'A candidate SKU, exactly as given.'},
      reason:{type:'string',description:'Why it goes with the list: one short sentence, at most 160 characters.'},
    }}}},
    required:['picks'],additionalProperties:false,
  },
};

export const SYSTEM_PROMPT=`You choose "Frequently bought together" suggestions for a customer of an industrial supply distributor. The customer has just matched a list of items to quote in chat. Fixed rules already found the candidates: the matching nut or washer for a graded bolt on the list, or items this customer often buys on the same orders as an item on the list. Every candidate is in stock and not on the list.

Pick at most 3 candidates the customer is most likely to need with this list, best first, and write a reason for each:
- One short sentence, at most 160 characters, addressed to the customer ("your list", "your orders"), using only the facts given: the bolt it matches, or how many of their orders had both items over the history window.
- Never mention or guess a price, cost, margin, discount or saving, and never write "$" or "%": you aren't given any of them.
- Plain and specific. No hype, no exclamation marks, no emoji.
- The template_reason is correct wording for the same facts. Improve how it reads, or keep it.
- Use each SKU exactly as given; never suggest anything that is not a candidate.

Call ${PICK_TOOL.name} once with your picks.`;

const Output=z.object({picks:z.array(z.unknown())}).loose();
const Pick=z.object({sku:z.string(),reason:z.string()}).loose();

/** The picks from Claude's tool call (unvalidated against the pool); empty when it didn't call the tool as asked. */
export function picksFrom(message:Anthropic.Message):SuggestionPick[]{
  const use=message.content.find((b):b is Anthropic.ToolUseBlock=>b.type==='tool_use'&&b.name===PICK_TOOL.name);
  const parsed=use?Output.safeParse(use.input):null;
  return (parsed?.success?parsed.data.picks:[]).flatMap(pick=>{const p=Pick.safeParse(pick);return p.success?[{sku:p.data.sku,reason:p.data.reason}]:[];});
}

export interface ClaudePickerOptions {
  client?:PickerClient;
  /** Defaults to ANTHROPIC_MODEL, else the live chat's default model. */
  model?:string;
  timeoutMs?:number;
  /** The clock, for the pause after a failure. */
  now?:()=>number;
  /** Where failures are reported (console.warn by default). */
  warn?:(message:string)=>void;
}

let shared:PickerClient|undefined;
/** One client per server process; the SDK reads ANTHROPIC_API_KEY. */
// TODO(R-2): pass the key from user secrets or a secrets manager instead of .env.local.
function defaultClient(){return shared??=new Anthropic({timeout:PICKER_TIMEOUT_MS,maxRetries:0});}

/**
 * A SuggestionPicker backed by Claude. Throws when the facts carry cost or price, when Claude fails,
 * and while pausing after a failure: the caller then uses the scripted picks.
 */
export function claudeSuggestionPicker({client,model=chatModel(),timeoutMs=PICKER_TIMEOUT_MS,now=Date.now,warn=message=>console.warn(message)}:ClaudePickerOptions={}):SuggestionPicker{
  let pausedUntil=0;
  return async(input:PickerInput)=>{
    const leaked=costKeys(input);
    if(leaked.length)throw new Error(`Suggestion facts for Claude may not carry cost, price or profit (${leaked.join(', ')}).`);
    if(now()<pausedUntil)throw new Error('Suggestion picker paused after a failure.');
    try{
      const response=await (client??defaultClient()).messages.create({
        model,max_tokens:PICKER_MAX_TOKENS,system:SYSTEM_PROMPT,tools:[PICK_TOOL],
        tool_choice:{type:'auto',disable_parallel_tool_use:true},
        messages:[{role:'user',content:`The customer's list and the candidates, as JSON:\n${JSON.stringify(input)}`}],
      },{timeout:timeoutMs,maxRetries:0});
      return picksFrom(response);
    }catch(error){
      pausedUntil=now()+PICKER_BACKOFF_MS;
      const message=error instanceof Error?error.message:String(error);
      warn(`Pop-up suggestions: Claude failed, using the scripted picks (${message}).`);
      throw new Error(message,{cause:error});
    }
  };
}

let live:SuggestionPicker|undefined;
/**
 * The picker for this server: Claude in live mode, and undefined in scripted mode (QUERENT_SCRIPTED=1
 * or no ANTHROPIC_API_KEY), where the pop-up gets the deterministic picks (spec §6.5, §10).
 */
export function suggestionPicker(env:Record<string,string|undefined>=process.env):SuggestionPicker|undefined{
  if(chatMode(env)!=='live')return undefined;
  return live??=claudeSuggestionPicker({model:chatModel(env)});
}
