import {CUSTOMER} from './accounts';
import {at} from './dates';
import type {SeedContext} from './reference';

type Outcome='answered'|'no_rows';
/** [question, categories, tool calls, answer, outcome] as logged by the chat pipeline. */
const QUESTIONS:[string,string[],string[],string,Outcome][]=[
  ['Do you have 2 in clear acrylic tape at Spanish Fork?',['items_stock'],['search_items','get_stock'],'Yes. Spanish Fork has 86 cases of T902170 (Clear Acrylic Tape, Hand Length, 2"x110yd 1.8 MIL, case of 36).','answered'],
  ['What did we pay for the cast stretch wrap last time?',['pricing','orders_quotes'],['search_items','get_order_history'],'You paid $69.95 a case for SF188CAST, your contract price.','answered'],
  ['Has our last order shipped?',['orders_quotes'],['get_order_status'],'Yes. Your most recent order has shipped.','answered'],
  ["What's our open balance?",['account'],['get_account_summary'],'Your open balance is $12,860.00, with nothing past due.','answered'],
  ['How many cases of 4x6 fanfold labels are in stock?',['items_stock'],['search_items','get_stock'],'Spanish Fork has 38 cases of THL576 (White Direct Thermal Labels, Fanfold, 4x6", case of 4,000).','answered'],
  ["Is the #2 poly bubble mailer in stock, and what's our price?",['items_stock','pricing'],['search_items','get_stock','get_price'],'Spanish Fork has 7 cases of B833, with 24 more due this week. Your price is $23.40 a case of 100.','answered'],
  ['What are our payment terms?',['account'],['get_account_summary'],'Your terms are Net 30.','answered'],
  ['Do you carry machine stretch wrap?',['items_stock'],['search_items','get_stock'],'Yes. MSF2080B (Blown Stretch Wrap, Machine Length, 20"x6000\' 80 Gauge) is in stock at Spanish Fork.','answered'],
  ["What's our price on 12x9x6 boxes?",['pricing'],['search_items','get_price'],'1296-BDL (Corrugated Boxes 12x9x6", 32 ECT single wall) is $0.86 a box, sold in bundles of 25.','answered'],
  ['Do you have 30 in wide stretch wrap?',['items_stock'],['search_items'],"We don't list a 30 in stretch wrap. The widest hand wrap is 18 in and machine wrap is 20 in.",'no_rows'],
  ['Is our quote for the zip bags still good?',['orders_quotes'],['get_order_status'],'That quote has expired. Landon Richards can requote it.','answered'],
  ["What's our credit limit?",['account'],['get_account_summary'],'Your credit limit is $40,000.00.','answered'],
];
const LOG_COUNT=40;

/** Forty Timpanogos chat questions over the last ~60 days, two or three per conversation. */
export function seedChatLogs({insert,anchor}:SeedContext){
  for(let i=0;i<LOG_COUNT;i++){
    const [question,categories,tools,answer,outcome]=QUESTIONS[i%QUESTIONS.length];
    const hour=String(14+(i*5)%9).padStart(2,'0'),minute=String((i*17)%60).padStart(2,'0');
    insert('query_logs',{id:`log-${i+1}`,customer_id:CUSTOMER.id,conversation_id:`history-${Math.floor(i/2.5)+1}`,question,categories:JSON.stringify(categories),handled_categories:JSON.stringify(categories),
      tool_calls:JSON.stringify(tools),row_count:outcome==='answered'?1+i%3:0,latency_ms:800+(i*137)%1600,outcome,answer,timestamp:at(anchor,-(1+Math.floor(i*1.5)),`${hour}:${minute}`)});
  }
}
