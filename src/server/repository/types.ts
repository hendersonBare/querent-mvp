import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';

// Domain types at the repository boundary (camelCase), the Supabase client type every repository
// function takes first, and the result shapes of the writes. Client-safe: types and constants only.

export type {Database,Json} from './database.types';

/** The request's user-scoped Supabase client (B2's server client, or a test client): URL and anon key plus the user's session, never a privileged key. */
export type Db=SupabaseClient<Database>;

export const MATCH_STRICTNESS_LEVELS=['strict','balanced','lenient'] as const;
export type MatchStrictness=typeof MATCH_STRICTNESS_LEVELS[number];
export const isMatchStrictness=(value:unknown):value is MatchStrictness=>MATCH_STRICTNESS_LEVELS.includes(value as MatchStrictness);

/** Who matched a line: the pipeline ('auto') or the rep ('Use this item', Swap). */
export type MatchedBy='auto'|'rep';

/** The one seeded example quote (read-only for everyone; scripts/seed-boxt.ts creates it). */
export const EXAMPLE_QUOTE_ID='0b0e0000-0000-4000-8000-000000000001';

export interface CatalogItem {
  sku:string;
  description:string;
  category:string|null;
  pack:string|null;
  caseQty:number|null;
  /** The public web list price: a reference label only, never a quote price. */
  listPrice:number|null;
  keywords:string;
}

/** A near-miss candidate kept with an unmatched line (a snapshot of the catalog row and its score). */
export interface NearMiss {
  sku:string;
  description:string;
  pack:string|null;
  listPrice:number|null;
  score:number|null;
}

/** A line as the app saves it. Lines are stored in array order (position = index + 1). */
export interface QuoteLineInput {
  /** The customer's original text for this line (required, not blank). */
  originalText:string;
  /** true: no catalog item; sku and matchedBy must be null. false: sku and matchedBy are required. */
  unmatched:boolean;
  sku:string|null;
  matchedBy:MatchedBy|null;
  description:string|null;
  pack:string|null;
  /** Reference only. */
  listPrice:number|null;
  /** > 0, or null when the list gave none. */
  quantity:number|null;
  unit:string|null;
  quantityUnclear:boolean;
  /** The customer's quantity as written ("10 pallets") when the line's quantity was converted from it or flagged; else null. */
  customerQuantity:string|null;
  /** >= 0, or null until the rep prices it. */
  unitPrice:number|null;
  matchScore:number|null;
  nearMisses:NearMiss[];
}

export interface QuoteLine extends QuoteLineInput {
  id:string;
  /** 1-based. */
  position:number;
  createdAt:string;
  updatedAt:string;
}

export interface QuoteInput {
  customerName:string;
  reference:string;
  /** The level the lines were matched at; omitted = the organization's current setting. */
  matchStrictness?:MatchStrictness;
  /** 1 to 200 lines. */
  lines:QuoteLineInput[];
}

/** A change to a quote: the header fields given, and when `lines` is given it replaces every line. */
export interface QuoteUpdate {
  customerName?:string;
  reference?:string;
  lines?:QuoteLineInput[];
}

export interface QuoteSummary {
  id:string;
  customerName:string;
  reference:string;
  isExample:boolean;
  matchStrictness:MatchStrictness;
  createdBy:string|null;
  createdByEmail:string|null;
  createdAt:string;
  updatedAt:string;
  lineCount:number;
  unmatchedCount:number;
  /** Σ round(quantity × unitPrice, 2) over matched lines that have both. */
  total:number;
}

export interface Quote extends QuoteSummary {
  /** Ordered by position. */
  lines:QuoteLine[];
}

export interface OrgSettings {
  matchStrictness:MatchStrictness;
  updatedAt:string;
  updatedBy:string|null;
}

/**
 * Why a write was refused: `invalid` input (nothing saved), `not_found`, the read-only `example`
 * quote, `unauthorized` (no session or no grant), or `failed` (anything else, e.g. the network).
 */
export type WriteError='invalid'|'not_found'|'example'|'unauthorized'|'failed';
export type WriteFailure={ok:false;error:WriteError;message:string};
export type WriteResult<T extends object={}>=({ok:true}&T)|WriteFailure;

/** A read that failed for a reason other than "not there" (no session, network). */
export class RepositoryError extends Error {
  constructor(operation:string,readonly code:string|null,message:string){
    super(`${operation}: ${message}`);
    this.name='RepositoryError';
  }
}
