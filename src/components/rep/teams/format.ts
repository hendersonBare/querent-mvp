import type {BoardCustomer} from '@/server/rep/teams';

// Teams and Reps' words (plan U7). The sentences are the frames' (C_TRBase to C_TR7), filled with real data.

/** "1 customer", "3 customers", "0 customers". */
export const count=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
/** "2 reps" (C_TRBase's Teams list, C_TR7). */
export const repsLabel=(n:number)=>count(n,'rep');
/** "Eli" from "Eli Porter" (C_TR4 "Eli will keep 1 customer."). */
export const firstName=(name:string)=>name.trim().split(/\s+/)[0]??name;
/** The line under "Also move this customer's open quotes" (C_TR2, C_TR4). */
export const MOVE_NOTE="Drafts, change requests and sent quotes that haven't expired go to the new rep, each with an Activity entry.";

/** The open quotes that move with the customer to `toRepId`: its open quotes that rep doesn't own yet (moveQuotes skips those). */
export const movingQuotes=(customer:BoardCustomer,toRepId:string)=>customer.open_quote_reps.filter(r=>r!==toRepId).length;
