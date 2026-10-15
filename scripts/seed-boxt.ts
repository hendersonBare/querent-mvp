// npm run db:seed:boxt — loads the BOXT catalog and the example quote into DATABASE_URL.
//
// - Upserts every row of data/boxt-catalog.json into catalog_items (on conflict (sku) do update), with
//   source 'boxtpackaging.com' and synced_at = now(). Rows no longer in the file are left alone.
// - Creates or refreshes the one Example quote (fixed id, is_example = true): 3 matched, priced lines
//   and 1 unmatched line with near-misses, its item details copied from the catalog rows.
// - Everything runs in one transaction, so a failure leaves the database as it was. Idempotent.
//
// Works against any database (local or a hosted project): DATABASE_URL from the shell, else from
// .env.local. It needs the migrations applied first, and a role that can write past the example-quote
// guard (the `postgres` role in DATABASE_URL): it sets `querent.seeding` for its own transaction, which
// is the guard's only exception (supabase/migrations/*_boxt_security.sql). Prints counts only.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Client} from 'pg';
import {EXAMPLE_QUOTE_ID} from '../src/server/repository/types';
import {isLocalUrl,loadEnvLocal} from './lib/env';
import {ROOT} from './lib/local-supabase';

interface CatalogFileRow {sku:string;description:string;category:string|null;pack:string|null;caseQty:number|null;list:number|null;keywords:string}

export function readCatalogFile(file=join(ROOT,'data/boxt-catalog.json')):CatalogFileRow[]{
  const rows=JSON.parse(readFileSync(file,'utf8')) as unknown;
  if(!Array.isArray(rows))throw new Error('data/boxt-catalog.json is not an array.');
  const seen=new Set<string>();
  return rows.map((raw,i)=>{
    const r=raw as Record<string,unknown>;
    const text=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v:null;
    const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
    const sku=text(r.sku)?.trim(),description=text(r.description);
    if(!sku||!description)throw new Error(`data/boxt-catalog.json row ${i+1} has no sku or description.`);
    if(seen.has(sku))throw new Error(`data/boxt-catalog.json repeats SKU ${sku}.`);
    seen.add(sku);
    return {sku,description,category:text(r.category),pack:text(r.pack),caseQty:num(r.caseQty),list:num(r.list),keywords:typeof r.keywords==='string'?r.keywords:''};
  });
}

/** The example quote: what a saved quote looks like, for a first-time user. Prices are illustrative. */
const EXAMPLE={
  customerName:'Example customer',
  reference:'Example quote',
  lines:[
    {sku:'12108-BDL',originalText:'500 - 12 x 10 x 8 single wall boxes, 32 ECT',quantity:500,unit:'each',unitPrice:1.05,matchedBy:'auto',matchScore:0.93},
    {sku:'M1044',originalText:'200 white mailer boxes 10x4x4',quantity:200,unit:'each',unitPrice:0.8,matchedBy:'auto',matchScore:0.9},
    {sku:'B855SS',originalText:'4 cs #2 kraft bubble mailers 8.5 x 12',quantity:4,unit:'case',unitPrice:31.5,matchedBy:'rep',matchScore:0.71},
  ],
  unmatched:{
    originalText:'250 boxes 12 x 10 x 8 double wall, 48 ECT',quantity:250,unit:'each',matchScore:0.58,
    nearMisses:[{sku:'12108-BDL',score:0.58},{sku:'12108-PLT',score:0.57},{sku:'12128-BDL',score:0.44}],
  },
} as const;

export interface SeedCounts {catalogRows:number;inserted:number;updated:number;exampleLines:number}

export async function seedBoxt(databaseUrl:string):Promise<SeedCounts>{
  const catalog=readCatalogFile();
  const client=new Client({connectionString:databaseUrl});
  await client.connect();
  try{
    await client.query('begin');
    const upsert=await client.query<{inserted:boolean}>(`
      insert into public.catalog_items as c (sku, description, category, pack, case_qty, list_price, keywords, source, synced_at)
      select r.sku, r.description, r.category, r.pack, r."caseQty", r.list, r.keywords, 'boxtpackaging.com', now()
        from jsonb_to_recordset($1::jsonb) as r(sku text, description text, category text, pack text, "caseQty" integer, list numeric, keywords text)
      on conflict (sku) do update
        set description = excluded.description, category = excluded.category, pack = excluded.pack,
            case_qty = excluded.case_qty, list_price = excluded.list_price, keywords = excluded.keywords,
            source = excluded.source, synced_at = excluded.synced_at
      returning (xmax = 0) as inserted`,[JSON.stringify(catalog)]);
    const inserted=upsert.rows.filter(r=>r.inserted).length;

    // The example quote. The guard lets this transaction (and only it) write the example.
    await client.query("set local querent.seeding = 'on'");
    const skus=[...new Set([...EXAMPLE.lines.map(l=>l.sku),...EXAMPLE.unmatched.nearMisses.map(n=>n.sku)])];
    const items=new Map((await client.query<{sku:string;description:string;pack:string|null;list_price:string|null}>(
      'select sku, description, pack, list_price from public.catalog_items where sku = any($1)',[skus])).rows.map(r=>[r.sku,r]));
    const missing=skus.filter(s=>!items.has(s));
    if(missing.length)throw new Error(`The example quote needs SKUs the catalog does not have: ${missing.join(', ')}.`);
    const price=(v:string|null)=>v===null?null:Number(v);

    await client.query(`
      insert into public.quotes (id, customer_name, reference, is_example, match_strictness, created_by, created_by_email)
      values ($1, $2, $3, true, 'strict', null, null)
      on conflict (id) do update
        set customer_name = excluded.customer_name, reference = excluded.reference, is_example = true,
            match_strictness = excluded.match_strictness`,[EXAMPLE_QUOTE_ID,EXAMPLE.customerName,EXAMPLE.reference]);
    await client.query('delete from public.quote_lines where quote_id = $1',[EXAMPLE_QUOTE_ID]);
    const lines=[
      ...EXAMPLE.lines.map(l=>{
        const item=items.get(l.sku)!;
        return {sku:l.sku,description:item.description,pack:item.pack,list_price:price(item.list_price),quantity:l.quantity,unit:l.unit,
          unit_price:l.unitPrice,matched_by:l.matchedBy,original_text:l.originalText,unmatched:false,match_score:l.matchScore,near_misses:[]};
      }),
      {sku:null,description:null,pack:null,list_price:null,quantity:EXAMPLE.unmatched.quantity,unit:EXAMPLE.unmatched.unit,unit_price:null,
        matched_by:null,original_text:EXAMPLE.unmatched.originalText,unmatched:true,match_score:EXAMPLE.unmatched.matchScore,
        near_misses:EXAMPLE.unmatched.nearMisses.map(n=>{
          const item=items.get(n.sku)!;
          return {sku:n.sku,description:item.description,pack:item.pack,listPrice:price(item.list_price),score:n.score};
        })},
    ];
    await client.query(`
      insert into public.quote_lines (quote_id, position, sku, description, pack, list_price, quantity, unit, unit_price,
                                      matched_by, original_text, unmatched, match_score, near_misses)
      select $1, r.position, r.sku, r.description, r.pack, r.list_price, r.quantity, r.unit, r.unit_price,
             r.matched_by, r.original_text, r.unmatched, r.match_score, coalesce(r.near_misses, '[]'::jsonb)
        from jsonb_to_recordset($2::jsonb) as r(position integer, sku text, description text, pack text, list_price numeric,
             quantity numeric, unit text, unit_price numeric, matched_by text, original_text text, unmatched boolean,
             match_score double precision, near_misses jsonb)`,[EXAMPLE_QUOTE_ID,JSON.stringify(lines.map((line,i)=>({position:i+1,...line})))]);
    await client.query('commit');
    return {catalogRows:catalog.length,inserted,updated:upsert.rowCount!-inserted,exampleLines:lines.length};
  }catch(error){
    await client.query('rollback').catch(()=>{});
    throw error;
  }finally{
    await client.end();
  }
}

async function main(){
  loadEnvLocal(ROOT);
  const databaseUrl=process.env.DATABASE_URL;
  if(!databaseUrl){
    console.error('db:seed:boxt needs DATABASE_URL (in the shell or .env.local). Nothing was changed.');
    process.exit(1);
  }
  const counts=await seedBoxt(databaseUrl);
  console.log(`Seeded the ${isLocalUrl(databaseUrl)?'local':'remote'} database: catalog ${counts.catalogRows} rows (${counts.inserted} new, ${counts.updated} updated); example quote ${counts.exampleLines} lines.`);
}

if(require.main===module){
  main().catch(error=>{
    console.error(`db:seed:boxt failed: ${error instanceof Error?error.message:String(error)}`);
    process.exit(1);
  });
}
