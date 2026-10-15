// @vitest-environment node
import {beforeAll,describe,expect,it} from 'vitest';
import {adminQuery,adminTransaction} from '../../../scripts/lib/local-admin';
import {DEV_USERS} from '../../../scripts/lib/dev-users';
import {anonClient,signedInClient} from '../../../scripts/lib/test-clients';
import {EXAMPLE_QUOTE_ID,type Db} from './index';

// Row-level security and grants against the local Supabase stack (npm run test:db). The app's only
// keys are the URL and the anon key: without a session they must reach nothing; signed in, a user
// reads the catalog and the quotes, never the activity log, and can never change the example quote.

const TABLES=['catalog_items','quotes','quote_lines','org_settings','activity_log','quote_summaries'] as const;
let anon:Db,rep:Db;

beforeAll(async()=>{
  anon=anonClient();
  ({db:rep}=await signedInClient(DEV_USERS[0].email));
});

describe('the anon key without a session',()=>{
  it.each(TABLES)('cannot read %s (no grant at all)',async table=>{
    // (Cast: from() is overloaded for tables and views, and `table` ranges over both.)
    const {data,error}=await anon.from(table as 'quotes').select('*').limit(1);
    expect(data??[]).toEqual([]);
    expect(error?.code).toBe('42501');
  });

  it('cannot write anything or call the quote functions',async()=>{
    expect((await anon.from('quotes').insert({customer_name:'x',reference:'x'})).error?.code).toBe('42501');
    expect((await anon.from('org_settings').update({match_strictness:'lenient'}).eq('id',1)).error?.code).toBe('42501');
    expect((await anon.from('activity_log').insert({action:'login',metadata:{}})).error?.code).toBe('42501');
    expect((await anon.rpc('create_quote',{payload:{customer_name:'x',reference:'x',lines:[]}})).error).not.toBeNull();
    expect((await anon.rpc('update_quote',{quote_id:EXAMPLE_QUOTE_ID,payload:{}})).error).not.toBeNull();
    expect((await adminQuery('select match_strictness from public.org_settings where id=1'))[0].match_strictness).toBe('strict');
  });

  it('cannot sign up: sign-ups are off on the stack',async()=>{
    const {data,error}=await anon.auth.signUp({email:`someone-${Date.now()}@boxt.test`,password:'a-long-enough-password-1'});
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it('has no grants on any Querent table, view, sequence or function',async()=>{
    const rows=await adminQuery(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind in ('r','v','S','m')
         and (has_table_privilege('anon',c.oid,'select,insert,update,delete,truncate,references,trigger')
              or (c.relkind='S' and has_sequence_privilege('anon',c.oid,'usage,select,update')))
      union all
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname in ('public','private') and has_function_privilege('anon',p.oid,'execute')`);
    expect(rows).toEqual([]);
  });
});

describe('a signed-in user',()=>{
  it('reads the whole catalog (1,555 rows) but cannot change it',async()=>{
    const {count,error}=await rep.from('catalog_items').select('*',{count:'exact',head:true});
    expect(error).toBeNull();
    expect(count).toBe(1555);
    expect((await rep.from('catalog_items').update({list_price:0}).eq('sku','M1044')).error?.code).toBe('42501');
    expect((await rep.from('catalog_items').delete().eq('sku','M1044')).error?.code).toBe('42501');
  });

  it('cannot read the activity log',async()=>{
    const {data,error}=await rep.from('activity_log').select('*').limit(1);
    expect(data??[]).toEqual([]);
    expect(error?.code).toBe('42501');
  });

  it('can update the strictness but cannot add or remove settings rows',async()=>{
    expect((await rep.from('org_settings').insert({id:2,match_strictness:'strict'})).error).not.toBeNull();
    expect((await rep.from('org_settings').delete().eq('id',1)).error).not.toBeNull();
    expect((await rep.from('org_settings').select('id'))).toMatchObject({data:[{id:1}],error:null});
  });

  it('cannot create an example quote or forge who created a quote',async()=>{
    expect((await rep.from('quotes').insert({customer_name:'x',reference:'x',is_example:true})).error).not.toBeNull();
    expect((await rep.from('quotes').insert({customer_name:'x',reference:'x',created_by:'00000000-0000-0000-0000-000000000000'})).error).not.toBeNull();
    expect((await adminQuery("select count(*)::int as n from public.quotes where customer_name='x'"))[0].n).toBe(0);
  });
});

describe('the example quote through the API',()=>{
  const snapshot=async()=>adminQuery(`select q.reference, q.customer_name, q.updated_at, (select json_agg(l order by l.position) from public.quote_lines l where l.quote_id=q.id) as lines from public.quotes q where q.id=$1`,[EXAMPLE_QUOTE_ID]);

  it('cannot be updated or deleted directly, nor can its lines',async()=>{
    const before=await snapshot();
    expect(before).toHaveLength(1);
    const updated=await rep.from('quotes').update({reference:'hijacked'}).eq('id',EXAMPLE_QUOTE_ID).select('id');
    expect(updated.data??[]).toEqual([]);
    const deleted=await rep.from('quotes').delete().eq('id',EXAMPLE_QUOTE_ID).select('id');
    expect(deleted.data??[]).toEqual([]);
    const lineUpdate=await rep.from('quote_lines').update({unit_price:0}).eq('quote_id',EXAMPLE_QUOTE_ID).select('id');
    expect(lineUpdate.data??[]).toEqual([]);
    const lineDelete=await rep.from('quote_lines').delete().eq('quote_id',EXAMPLE_QUOTE_ID).select('id');
    expect(lineDelete.data??[]).toEqual([]);
    const lineInsert=await rep.from('quote_lines').insert({quote_id:EXAMPLE_QUOTE_ID,position:99,original_text:'extra',unmatched:true});
    expect(lineInsert.error).not.toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it('cannot be changed through update_quote',async()=>{
    const before=await snapshot();
    const {error}=await rep.rpc('update_quote',{quote_id:EXAMPLE_QUOTE_ID,payload:{reference:'hijacked'}});
    expect(error).toMatchObject({hint:'example_quote'});
    expect(await snapshot()).toEqual(before);
  });

  it('is guarded by a trigger too, so even a privileged connection cannot change it unless it is the seed',async()=>{
    await expect(adminQuery('update public.quotes set reference=$2 where id=$1',[EXAMPLE_QUOTE_ID,'hijacked'])).rejects.toThrow(/example quote/i);
    await expect(adminQuery('delete from public.quotes where id=$1',[EXAMPLE_QUOTE_ID])).rejects.toThrow(/example quote/i);
    await expect(adminQuery('delete from public.quote_lines where quote_id=$1',[EXAMPLE_QUOTE_ID])).rejects.toThrow(/example quote/i);
    await expect(adminQuery("insert into public.quotes (customer_name, reference, is_example) values ('x','x',true)")).rejects.toThrow(/example quote/i);
    // The seed sets querent.seeding for its transaction; this one rolls back, so nothing changes.
    await adminTransaction(async query=>{
      await query("select set_config('querent.seeding','on',true)");
      await query('update public.quotes set reference=reference where id=$1',[EXAMPLE_QUOTE_ID]);
    },{rollback:true});
  });

  it('the seeding switch does nothing for API roles',async()=>{
    await expect(adminTransaction(async query=>{
      await query("select set_config('querent.seeding','on',true)");
      await query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:'00000000-0000-0000-0000-000000000000',role:'authenticated'})]);
      await query('set local role authenticated');
      await query('update public.quote_lines set unit_price=0 where quote_id=$1',[EXAMPLE_QUOTE_ID]);
      const rows=await query('select count(*)::int as n from public.quote_lines where quote_id=$1 and unit_price=0',[EXAMPLE_QUOTE_ID]);
      if(rows[0].n>0)throw new Error('authenticated changed the example quote');
      await query('delete from public.quotes where id=$1',[EXAMPLE_QUOTE_ID]);
      const left=await query('select count(*)::int as n from public.quotes where id=$1',[EXAMPLE_QUOTE_ID]);
      if(left[0].n!==1)throw new Error('authenticated deleted the example quote');
    },{rollback:true})).resolves.toBeUndefined();
    // The service role bypasses RLS, so here only the trigger stands in the way, switch or not.
    for(const statement of ['update public.quotes set reference=$2 where id=$1','delete from public.quotes where id=$1','update public.quote_lines set unit_price=0 where quote_id=$1']){
      await expect(adminTransaction(async query=>{
        await query("select set_config('querent.seeding','on',true)");
        await query('set local role service_role');
        await query(statement,statement.includes('$2')?[EXAMPLE_QUOTE_ID,'hijacked']:[EXAMPLE_QUOTE_ID]);
      },{rollback:true}),statement).rejects.toThrow(/example quote/i);
    }
  });
});
