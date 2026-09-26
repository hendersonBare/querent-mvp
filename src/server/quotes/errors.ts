import type {SendBlocker} from './send-check';

// Why a quote action was refused. One class with a code, so an API route maps every refusal
// to an HTTP status in one place (error.httpStatus) and the UI can branch on error.code.

export const QUOTE_ACTION_ERRORS={
  /** No such quote, or not this customer's. */
  not_found:404,
  /** The status doesn't allow the action (spec §5.4), e.g. a double send or accepting a draft. */
  illegal_transition:409,
  /** The quote changed since the caller read it: another transition won, a newer revision was sent, or the draft was edited mid-send. */
  conflict:409,
  /** Accept or Request changes after valid_until (spec §3: the action bar is disabled once expired). */
  expired:409,
  /** Send refused because the quote is unfinished (spec §4); `blockers` says why. */
  send_blocked:422,
  /** A required input is missing or malformed: a change-request note, the PO, the pickup or delivery time. */
  invalid_input:400,
} as const;
export type QuoteActionErrorCode=keyof typeof QUOTE_ACTION_ERRORS;

export class QuoteActionError extends Error{
  readonly code:QuoteActionErrorCode;
  readonly httpStatus:number;
  /** Set for send_blocked; empty otherwise. */
  readonly blockers:readonly SendBlocker[];
  constructor(code:QuoteActionErrorCode,message:string,{blockers=[]}:{blockers?:readonly SendBlocker[]}={}){
    super(message);
    this.name='QuoteActionError';this.code=code;this.httpStatus=QUOTE_ACTION_ERRORS[code];this.blockers=blockers;
  }
}
