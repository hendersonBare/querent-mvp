import 'server-only';
import type {ChatReplyKind,ClarifyPayload,ItemPopupPayload} from '@/domain';
import type {Category,ChatAnswer} from '@/lib/contracts';
import {assignedRep} from '@/server/repository/customer';

// What either chat engine (scripted or live) returns for one customer message. The pipeline stores
// it as the assistant message and logs it in query_logs for analytics.

export interface ChatReply {
  kind:ChatReplyKind;
  /** Markdown shown in the chat bubble. */
  content:string;
  payload:ClarifyPayload|ItemPopupPayload|null;
  /** Information categories the message asked about, and those actually answered. */
  categories:Category[];
  handled:Category[];
  toolCalls:string[];
  rowCount:number;
  outcome:ChatAnswer['outcome'];
}

/** A reply with defaults: plain text, answered, no categories, tools or payload. */
export const reply=(r:Partial<ChatReply>&Pick<ChatReply,'content'>):ChatReply=>({kind:'text',payload:null,categories:[],handled:[],toolCalls:[],rowCount:0,outcome:'answered',...r});

/** "{lead}: phone or email." for the customer's assigned rep, with {rep} replaced by the rep's name. */
export function repHelp(customerId:string,lead:string){
  const rep=assignedRep(customerId);
  return rep?`${lead.replace('{rep}',rep.name)}: ${rep.phone} or ${rep.email}.`:'BOXT customer service can help.';
}
