import {WASATCH} from './accounts';
import {at} from './dates';
import type {SeedContext} from './reference';

type Outcome='answered'|'no_rows';
/** [question, categories, tool calls, answer, outcome] as logged by the chat pipeline. */
const QUESTIONS:[string,string[],string[],string,Outcome][]=[
  ['Do you have 1/2-13 grade 8 hex nuts at Ogden?',['items_stock'],['search_items','get_stock'],'Yes. Ogden has 40 boxes of HN-12-13-G8 (hex nut 1/2-13, Grade 8, box of 100).','answered'],
  ['What did we pay for the Type 1 cut-off wheels last time?',['pricing','orders_quotes'],['search_items','get_order_history'],'You paid $36.00 a box for CW-45-045-T1, your contract price.','answered'],
  ['Has our last order shipped?',['orders_quotes'],['get_order_status'],'Yes. Your most recent order has shipped.','answered'],
  ["What's our open balance?",['account'],['get_account_summary'],'Your open balance is $18,420.00, with nothing past due.','answered'],
  ['How many cases of large black nitrile gloves are at SLC?',['items_stock'],['search_items','get_stock'],'SLC has 9 cases of GLV-N8-L-1000 (8 mil, black, size L).','answered'],
  ["Is the 60 grit flap disc in stock, and what's our price?",['items_stock','pricing'],['search_items','get_stock','get_price'],'Yes. SLC has 52 boxes of FD-45-60Z. Your contract price is $44.25 a box.','answered'],
  ['What are our payment terms?',['account'],['get_account_summary'],'Your terms are Net 30.','answered'],
  ['Do you carry 4 in ratchet straps?',['items_stock'],['search_items','get_stock'],'Yes. RS-4-30-FH (4 in x 30 ft, flat hooks): 12 at SLC, 8 at Ogden, 3 at Provo.','answered'],
  ["What's our price on 55 gallon trash liners?",['pricing'],['search_items','get_price'],'TL-55-BLK is $33.50 a case of 100.','answered'],
  ['Do you have 6 in Type 27 cut-off wheels?',['items_stock'],['search_items'],"We don't stock a 6 in Type 27 cut-off wheel. The closest is CW-6-045-T1 (6 in, Type 1).",'no_rows'],
  ['Is our quote for the socket set still good?',['orders_quotes'],['get_order_status'],'That quote has expired. Brandi Gallegos can requote it.','answered'],
  ["What's our credit limit?",['account'],['get_account_summary'],'Your credit limit is $50,000.00.','answered'],
];
const LOG_COUNT=40;

/** Forty Wasatch chat questions over the last ~60 days, two or three per conversation. */
export function seedChatLogs({insert,anchor}:SeedContext){
  for(let i=0;i<LOG_COUNT;i++){
    const [question,categories,tools,answer,outcome]=QUESTIONS[i%QUESTIONS.length];
    const hour=String(14+(i*5)%9).padStart(2,'0'),minute=String((i*17)%60).padStart(2,'0');
    insert('query_logs',{id:`log-${i+1}`,customer_id:WASATCH.id,conversation_id:`history-${Math.floor(i/2.5)+1}`,question,categories:JSON.stringify(categories),handled_categories:JSON.stringify(categories),
      tool_calls:JSON.stringify(tools),row_count:outcome==='answered'?1+i%3:0,latency_ms:800+(i*137)%1600,outcome,answer,timestamp:at(anchor,-(1+Math.floor(i*1.5)),`${hour}:${minute}`)});
  }
}
