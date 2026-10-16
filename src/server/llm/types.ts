// The LLM contract (docs/boxt/plan.md, "LLM contract"). The parser turns a customer's list (pasted
// text or a PDF) into rows; the judge says which retrieved candidate, if any, is the same product as
// one row. Both have a live (Claude) and a scripted (fixture) implementation; see index.ts.

export type ParseInput={kind:'text';text:string}|{kind:'pdf';data:Uint8Array;filename?:string};

export interface ParsedRow {
  /** The whole original line as the customer wrote it. */
  rawText:string;
  /** The item description only: no quantity, price or supplier SKU. */
  description:string;
  /** A positive number, or null when unclear (then quantityUnclear is true). */
  quantity:number|null;
  /** "case", "bundle", "each", "roll", … when stated. */
  unit:string|null;
  /** The other supplier's SKU when present (e.g. Uline "S-4128"). */
  suppliersSku:string|null;
  quantityUnclear:boolean;
}

export type ParseResult={ok:true;rows:ParsedRow[]}|{ok:false;error:string};

/** Optional per-call options for the parser (an extension of the contract: callers may omit them). */
export interface ParseOptions {
  /** Aborts the call (the quote tool's match route bounds the parse time with it). */
  signal?:AbortSignal;
}

export interface Parser {parse(input:ParseInput,options?:ParseOptions):Promise<ParseResult>}

export interface JudgeCandidate {sku:string;description:string;pack?:string|null;category?:string|null}

/** null = none; anything not in the candidate list becomes null. */
export type JudgeVerdict={sku:string|null;reason:string};

/** Optional per-call options (an extension of the contract: callers may omit them). */
export interface JudgeOptions {signal?:AbortSignal}

export interface Judge {
  judge(line:{description:string;rawText:string},candidates:JudgeCandidate[],options?:JudgeOptions):Promise<JudgeVerdict>;
}
