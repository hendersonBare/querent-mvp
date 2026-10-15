// The quote tool's wire types (docs/boxt/plan.md "API"), shared by the server (pipeline, match route,
// catalog search, save) and the browser (input page, review dialog). Client-safe: types and constants only.

import type {StrictnessLevel} from '@/features/settings/strictness';

/** A catalog item as the review dialog shows it. `pack` is the pack label ("Bundle of 25", "Case of 500"). */
export interface ResultItem {
  sku:string;
  description:string;
  pack:string|null;
  category:string|null;
  /** The public web list price: a reference label only, never a quote price. */
  listPrice:number|null;
}

/** A catalog item with its scorer score (0 to 1): a Swap candidate, a near-miss or a search hit. */
export interface ScoredItem extends ResultItem {score:number}

/**
 * Why a line came out as it did. `matched`; or why it is No match: the scorer's top item is below the
 * level's minimum score (`below_threshold`) or too close to another item (`low_lead`), the judge said
 * none (`judge_none`), picked another product (`judge_disagrees`), failed or timed out (`judge_error`),
 * or nothing in the catalog scored at all (`no_candidates`).
 */
export type LineReason='matched'|'below_threshold'|'low_lead'|'judge_none'|'judge_disagrees'|'judge_error'|'no_candidates';

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
