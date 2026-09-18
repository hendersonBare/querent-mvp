import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type {Category} from '@/lib/contracts';
import {categories} from '@/lib/contracts';
import {queryRows,type Row} from './repository';

const schema=`parts_stock(id,sku,description,branch,quantity,unit_price); equipment_stock(id,stock_number,model,branch,condition,quantity,price); orders_current/orders_past(id,customer_id,order_number,description,status,order_date,expected_delivery,tracking_number,total); service_records(id,customer_id,equipment,service_date,description,status,cost); financing(id,customer_id,plan_number,equipment,balance,monthly_payment,next_payment_date,maturity_date); other(id,customer_id,account_number,business_name,branch,address,contact_name,contact_email)`;
async function complete(system:string,prompt:string){const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});const result=await client.messages.create({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5',max_tokens:1800,system,messages:[{role:'user',content:prompt}]});const block=result.content.find(x=>x.type==='text');if(!block||block.type!=='text')throw new Error('Claude returned no text');return block.text.trim();}
export async function claudeQuery(question:string,customerId:string,allowed:Set<Category>,history:Row[]){
  const classified=await complete(`Return only JSON {"categories":[]} using these categories: ${categories.join(', ')}. Include every requested category. Current orders are quoted/open/shipped; past orders are delivered/closed.`,JSON.stringify({question,history}));
  const requested=(JSON.parse(classified.match(/\{[\s\S]*\}/)?.[0]||'{}').categories||[]).filter((x:string)=>(categories as readonly string[]).includes(x)) as Category[];
  const handled=requested.filter(c=>allowed.has(c));if(!handled.length)return {categories:requested,handled,sql:null,rows:[],answer:'That information isn’t available here.'};
  const sql=await complete('Generate exactly one SQLite SELECT or WITH query. Return raw SQL only. Never use markdown, comments, PRAGMA, ATTACH, writes, or system tables. Use only allowed tables. Customer-scoped tables must filter to the supplied customer_id literal. LIMIT 200.',JSON.stringify({question,customer_id:customerId,allowed_categories:handled,schema,history}));
  const rows=queryRows(sql);const answer=await complete('Answer only the permitted question from the supplied rows. Be concise, use Markdown tables for more than 3 rows, never expose internal IDs/customer IDs, and never invent data.',JSON.stringify({question,categories:handled,rows,result_limit_reached:rows.length===200}));
  return {categories:requested,handled,sql,rows,answer};
}
