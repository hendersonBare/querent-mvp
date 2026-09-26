import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import {z} from 'zod';
import {FULFILLMENTS} from '@/domain';
import type {Category} from '@/lib/contracts';
import {
  TOOL_CATEGORY,TOOL_NAMES,getAccountSummaryTool,getOrderHistoryTool,getOrderStatusTool,getPriceTool,getStockTool,proposeCartTool,searchItemsTool,toolDenied,
  MAX_REQUEST_LINES,type ToolContext,type ToolName,type ToolResult,
} from './tools';

// The chat tools as Claude sees them (spec §6.3): name, description and input schema, plus the
// dispatcher live chat runs a tool_use block through. Inputs are validated here with the same
// schemas Claude is given; the handlers in ./tools.ts check the customer's access toggles.

const SKU=z.string().trim().min(1).max(40);
const SKUS=z.array(SKU).min(1).max(20).describe('Catalog SKUs, e.g. ["HCS-12-13-2G8"]. Use the SKUs search_items returned.');

const INPUTS={
  search_items:z.object({
    query:z.string().trim().min(1).max(2000).describe(`What the customer asked for, one item per line (up to ${MAX_REQUEST_LINES}), in their words: "10 boxes of 1/2 in grade 8 hex bolts\\n6 boxes of cut-off wheels". Quantities may stay in; they are read and taken out before scoring.`),
    limit:z.number().int().min(1).max(20).optional().describe('Candidates per line, best first. Default 5.'),
  }),
  get_stock:z.object({skus:SKUS}),
  get_price:z.object({skus:SKUS}),
  get_order_history:z.object({
    skus:SKUS.optional().describe('Only these SKUs. Leave out for everything the customer bought.'),
    since:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Only orders on or after this day, YYYY-MM-DD.'),
    limit:z.number().int().min(1).max(50).optional().describe('Most lines to return, newest first. Default 20.'),
  }),
  get_order_status:z.object({
    reference:z.string().trim().max(40).optional().describe('An order number (SO-51223), the customer\'s PO number, or a quote number (Q-24817). Leave out for the latest order.'),
  }),
  get_account_summary:z.object({}),
  propose_cart:z.object({
    lines:z.array(z.object({
      sku:SKU.describe('A SKU search_items matched with confidence, or one the customer picked from the candidates.'),
      qty:z.number().int().min(1).max(9999).describe('Packs to quote (the item\'s pack, e.g. boxes of 50). 1 when the customer gave no qty.'),
      requested_text:z.string().max(500).optional().describe('What the customer said for this line.'),
    })).min(1).max(50),
    fulfillment:z.enum(FULFILLMENTS).optional().describe('will_call (pickup, the default) or delivery.'),
    branch_id:z.string().optional().describe('Branch id to pick up from or deliver from (see the branch list). Default: the first branch.'),
  }),
} satisfies Record<ToolName,z.ZodType>;

const DESCRIPTIONS:Record<ToolName,string>={
  search_items:'Match what the customer asked for to catalog SKUs. Returns, for each requested line, scored candidates (identity only: SKU, description, pack, category), whether the best one is a confident match, and if not, the clarifying question to ask. Call it whenever the customer names goods, before get_stock, get_price or propose_cart, and never guess a SKU it did not return. Handles "the usual" from order history.',
  get_stock:'Stock on hand at every branch for up to 20 SKUs: available, on order, and the next receipt date. Use for "do you have ...", "how many ... at Ogden".',
  get_price:'The customer\'s own prices per pack for up to 20 SKUs: list price, their price-level price, an active contract price, and your_price (what they pay today). Use for "what\'s my price on ...". A quote is priced by the rep and can differ.',
  get_order_history:'Lines the customer bought, newest first: order number, date, PO, SKU, qty, and the unit price paid when their account shows prices. Use for "what did we pay last time", "when did we last order ...", "how many do we usually buy".',
  get_order_status:'Status of one order (by order number or PO number, or the latest order when no reference is given): status, dates, pickup or delivery, branch, tracking and totals. A quote number (Q-...) gives that quote\'s status, revision, valid-until date and last sent total.',
  get_account_summary:'The customer\'s account: payment terms, credit limit, open and past-due balances, available credit, tax status, and their assigned rep.',
  propose_cart:'Open the item pop-up for a quote request. Call it only when every requested line has a confident SKU (or one the customer picked) and a qty. The customer checks quantities, pickup or delivery and the branch in the pop-up, then presses Request quote; this does not create a quote. No prices.',
};

export interface ToolRun {
  /** The tool, or null when Claude named one that doesn't exist. */
  name:ToolName|null;
  /** The categories the call asked about (its toggle's category, plus Pricing when order history showed prices). */
  categories:Category[];
  result:ToolResult<unknown>;
  /** Rows of data returned: candidates, items, lines, or 1 for an order, quote or account. */
  rows:number;
}

/** Each tool's handler, given its validated input. */
const HANDLERS={
  search_items:(ctx:ToolContext,input:z.infer<typeof INPUTS.search_items>)=>searchItemsTool(ctx,input),
  get_stock:(ctx:ToolContext,input:z.infer<typeof INPUTS.get_stock>)=>getStockTool(ctx,input),
  get_price:(ctx:ToolContext,input:z.infer<typeof INPUTS.get_price>)=>getPriceTool(ctx,input),
  get_order_history:(ctx:ToolContext,input:z.infer<typeof INPUTS.get_order_history>)=>getOrderHistoryTool(ctx,input),
  get_order_status:(ctx:ToolContext,input:z.infer<typeof INPUTS.get_order_status>)=>getOrderStatusTool(ctx,input),
  get_account_summary:(ctx:ToolContext)=>getAccountSummaryTool(ctx,{}),
  propose_cart:(ctx:ToolContext,input:z.infer<typeof INPUTS.propose_cart>)=>proposeCartTool(ctx,input),
};

type Data<N extends ToolName>=ReturnType<(typeof HANDLERS)[N]> extends ToolResult<infer T>?T:never;
/** How many rows each tool's answer holds, for the query log. */
const ROWS:{[N in ToolName]:(data:Data<N>)=>number}={
  search_items:d=>d.lines.reduce((n,l)=>n+l.candidates.length,0),
  get_stock:d=>d.items.length,
  get_price:d=>d.items.length,
  get_order_history:d=>d.lines.length,
  get_order_status:d=>d.order||d.quote?1:0,
  get_account_summary:()=>1,
  propose_cart:d=>d.lines.length,
};

const isToolName=(name:string):name is ToolName=>(TOOL_NAMES as readonly string[]).includes(name);

/**
 * Runs one tool call from Claude: the access check first (so a turned-off category is always
 * reported as restricted), then input validation, then the handler.
 */
export function runTool(ctx:ToolContext,name:string,input:unknown):ToolRun{
  if(!isToolName(name))return {name:null,categories:[],rows:0,result:{ok:false,reason:'invalid',message:`There is no tool called ${name}.`}};
  const categories:Category[]=[TOOL_CATEGORY[name]];
  const denied=toolDenied(ctx,name);
  if(denied)return {name,categories,rows:0,result:denied};
  const parsed=INPUTS[name].safeParse(input??{});
  if(!parsed.success)return {name,categories,rows:0,result:{ok:false,reason:'invalid',message:`Invalid input for ${name}: ${z.prettifyError(parsed.error)}`}};
  const result=(HANDLERS[name] as (ctx:ToolContext,input:unknown)=>ToolResult<unknown>)(ctx,parsed.data);
  if(!result.ok)return {name,categories,rows:0,result};
  const rows=(ROWS[name] as (data:unknown)=>number)(result.data);
  const pricesShown=name==='get_order_history'&&(result.data as {prices_shown:boolean}).prices_shown&&rows>0;
  return {name,categories:pricesShown?[...categories,'pricing']:categories,rows,result};
}

/** A JSON Schema for Claude from the zod input schema. */
function inputSchema(schema:z.ZodType):Anthropic.Tool.InputSchema{
  const {$schema:_,...json}=z.toJSONSchema(schema,{io:'input'}) as Record<string,unknown>;
  return json as Anthropic.Tool.InputSchema;
}

/** The tool list sent to Claude, in a fixed order so the request prefix stays cacheable. */
export const TOOL_DEFINITIONS:Anthropic.Tool[]=TOOL_NAMES.map(name=>({name,description:DESCRIPTIONS[name],input_schema:inputSchema(INPUTS[name])}));
