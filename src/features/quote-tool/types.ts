// The quote tool's wire types (docs/boxt/plan.md "API"), shared by the server (pipeline, match route,
// catalog search, save) and the browser (input page, review dialog). Client-safe: types and constants only.

import type {StrictnessLevel} from '@/features/settings/strictness';
import type {NoMatchReason} from '@/server/matching/decide';

/** A catalog item as the review dialog shows it. `pack` is the pack label ("Bundle of 25", "Case of 500"). */
export interface ResultItem {
  sku:string;
  description:string;
  pack:string|null;
  category:string|null;
  /** The public web list price: a reference label only, never a quote price. */
  listPrice:number|null;
  /** What the list price is per ("each", "case", "roll", "coil"), from the catalog's pack; null when unknown. */
  listPriceUnit:string|null;
}

/** What a catalog pack's list price is per: "Each" → each, "Case of 500" → case, "Roll" → roll. */
export function listPriceUnit(pack:string|null|undefined):string|null{
  const word=/^\s*([a-z]+)/i.exec(pack??'')?.[1]?.toLowerCase();
  return word??null;
}

/** A catalog item with its scorer score (0 to 1): a Swap candidate, a near-miss or a search hit. */
export interface ScoredItem extends ResultItem {score:number}

/**
 * Why a line came out as it did: `matched`; `judge_error` (the judge failed or timed out: No match); or
 * the matcher's own No-match reason (decide.ts NoMatchReason: below_threshold, low_lead, no_product_type,
 * judge_none, …). Derived from the matcher's type, so a reason it adds flows through; the dialog shows
 * "Could not detect a match" for every No-match reason, with a hint only for the ones it knows.
 */
export type LineReason='matched'|'judge_error'|NoMatchReason;

/** Whether the line can be matched at Strict at all, and why not (the matcher's words), when the matcher reports it. */
export interface LineEligibility {strictEligible:boolean;blockers:string[]}

/** One parsed row of the customer's list and its one outcome. */
export interface ResultLine {
  /** 0-based position in the parsed list. */
  index:number;
  /** The customer's line as written. */
  rawText:string;
  /** The item description the parser took from it. */
  description:string;
  quantity:number|null;
  unit:string|null;
  quantityUnclear:boolean;
  outcome:'matched'|'no_match';
  reason:LineReason;
  /** The matched item (outcome 'matched' only). */
  item?:ResultItem;
  /** The matched item's score, else the top candidate's (0 when there is none). */
  score:number;
  /** The scorer's candidates, best first (at most 8): what Swap offers. */
  candidates:ScoredItem[];
  /** The best item of each product group, best first (at most 5): what a No-match line offers. */
  nearMisses:ScoredItem[];
  /** The matcher's Strict eligibility and blockers for the line, when it reports them. */
  eligibility?:LineEligibility;
}

export interface MatchCounts {
  rows:number;
  matched:number;
  unmatched:number;
  /** Lines the judge was asked about (only lines whose scorer result cleared the level). */
  judged:number;
}

/** A finished match run: the level it ran at, its lines in list order, and the counts. */
export interface MatchRun {
  level:StrictnessLevel;
  lines:ResultLine[];
  counts:MatchCounts;
}

export type MatchStage='parse'|'match'|'judge';

export interface ProgressEvent {stage:MatchStage;done:number;total:number}

/** One line of the match route's NDJSON stream. The stream ends after a `result` or an `error`. */
export type MatchStreamEvent=
  |({type:'progress'}&ProgressEvent)
  |{type:'result';run:MatchRun}
  |{type:'error';message:string};

// ---- Input limits (the page checks them first; the route enforces them) ------------------------------

/** Non-empty lines a pasted list may have (and parsed rows a PDF may give). */
export const MAX_LIST_LINES=200;
/** Characters a pasted list may have. */
export const MAX_LIST_CHARS=60_000;
/** Bytes a PDF may have. */
export const MAX_PDF_BYTES=4*1024*1024;

/**
 * File types a PDF may arrive with: its own, or the generic ones some browsers and mail clients give a
 * PDF (then its first bytes decide). Any other type is refused, whatever the bytes.
 */
export const PDF_UPLOAD_TYPES:readonly string[]=['application/pdf','application/octet-stream',''];
const PDF_MAGIC=[0x25,0x50,0x44,0x46,0x2d]; // "%PDF-"

/** true when `bytes` starts like a PDF ("%PDF-"). */
export const hasPdfMagic=(bytes:Uint8Array)=>PDF_MAGIC.every((byte,i)=>bytes[i]===byte);

/** The non-empty lines of a pasted list. */
export const countListLines=(text:string)=>text.split(/\r?\n|\r/).filter(line=>line.trim()!=='').length;

// ---- Saving (POST /api/quotes) --------------------------------------------------------------------------

/** A matched line as the dialog sends it. The item's description, pack and list price come from the catalog on the server. */
export interface SaveMatchedLine {
  unmatched:false;
  sku:string;
  matchedBy:'auto'|'rep';
  originalText:string;
  quantity:number;
  unit?:string|null;
  quantityUnclear?:boolean;
  unitPrice:number;
  matchScore?:number|null;
}

/** An unmatched line: the customer's text, the quantity if any, and the near-misses the rep saw (SKU and score). */
export interface SaveUnmatchedLine {
  unmatched:true;
  originalText:string;
  quantity:number|null;
  unit?:string|null;
  quantityUnclear?:boolean;
  nearMisses?:{sku:string;score:number|null}[];
}

export type SaveLine=SaveMatchedLine|SaveUnmatchedLine;

export interface SaveQuoteRequest {
  customerName?:string;
  reference?:string;
  /** The level the lines were matched at (the run's level). */
  matchStrictness?:StrictnessLevel;
  lines:SaveLine[];
}
