import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The Teams and Reps routes (plan U7; Appendix D "teams create, rename, delete; add or remove members;
// move a team under another team"): manager only. Reps and the customer get 403, no session 401, and
// nothing changes. Every write answers the whole board, as GET does.
//   GET    /api/rep/teams                      the board
//   POST   /api/rep/teams                      {name, rep_ids?, parent_team_id?}
//   PATCH  /api/rep/teams/<id>                 {name?, parent_team_id?}
//   DELETE /api/rep/teams/<id>
//   PUT    /api/rep/teams/<id>/members         {add?, remove?}
useSeededDatabase();

type Persona='supplier'|'mara'|'eli'|'customer'|null;
type Method='GET'|'POST'|'PATCH'|'DELETE'|'PUT';
async function call(method:Method,{id,members=false,body,persona='supplier'}:{id?:number;members?:boolean;body?:unknown;persona?:Persona}={}){
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const url=`http://127.0.0.1/api/rep/teams${id!==undefined?`/${id}`:''}${members?'/members':''}`;
  const request=new NextRequest(url,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const context={params:Promise.resolve({id:String(id)})};
  let response:Response;
  if(members)response=await (await import('./[id]/members/route')).PUT(request,context);
  else if(id!==undefined){
    const route=await import('./[id]/route');
    response=method==='DELETE'?await route.DELETE(request,context):await route.PATCH(request,context);
  }else{
    const route=await import('./route');
    response=method==='POST'?await route.POST(request):await route.GET(request);
  }
  return {status:response.status,cache:response.headers.get('cache-control'),json:await response.json()};
}
type Team={id:number;name:string;parent_team_id:number|null;member_ids:string[];rep_ids:string[]};
const teamNamed=(json:{teams:Team[]},name:string)=>json.teams.find(t=>t.name===name)!;

describe('who may use the teams routes',()=>{
  it('serves the manager the board, never cached',async()=>{
    const board=await call('GET');
    expect(board).toMatchObject({status:200,cache:expect.stringMatching(/no-store/)});
    expect(board.json.reps.map((r:{id:string})=>r.id)).toEqual(['eli','mara','nora']);
    expect(board.json.teams.map((t:Team)=>t.name)).toEqual(['Inside Sales','Outside Sales']);
  });

  it('refuses reps and the customer with 403 and no session with 401, on every route, changing nothing',async()=>{
    const inside=teamNamed((await call('GET')).json,'Inside Sales').id;
    for(const persona of ['mara','eli','customer',null] as const){
      const status=persona?403:401;
      expect((await call('GET',{persona})).status).toBe(status);
      expect((await call('POST',{persona,body:{name:'Hacked'}})).status).toBe(status);
      expect((await call('PATCH',{persona,id:inside,body:{name:'Hacked'}})).status).toBe(status);
      expect((await call('DELETE',{persona,id:inside})).status).toBe(status);
      expect((await call('PUT',{persona,id:inside,members:true,body:{add:['eli']}})).status).toBe(status);
    }
    const board=(await call('GET')).json;
    expect(board.teams.map((t:Team)=>t.name)).toEqual(['Inside Sales','Outside Sales']);
    expect(teamNamed(board,'Inside Sales').member_ids).toEqual(['brandi','mara']);
  });
});

describe('the manager’s team writes',()=>{
  it('creates, renames, moves inside another team, changes members and deletes, each answering the board',async()=>{
    const created=await call('POST',{body:{name:'Counter and Yard',rep_ids:['nora'],parent_team_id:null}});
    expect(created.status).toBe(200);
    const id=teamNamed(created.json,'Counter and Yard').id;
    expect(teamNamed(created.json,'Counter and Yard').member_ids).toEqual(['nora']);
    expect(await call('POST',{body:{name:'counter and yard'}})).toMatchObject({status:400,json:{detail:'Another team is called counter and yard.'}});
    expect(await call('POST',{body:'not json'})).toMatchObject({status:400});

    const inside=teamNamed(created.json,'Inside Sales').id;
    const moved=await call('PATCH',{id,body:{parent_team_id:inside}});
    expect(teamNamed(moved.json,'Counter and Yard').parent_team_id).toBe(inside);
    expect(teamNamed(moved.json,'Inside Sales').rep_ids).toEqual(['brandi','mara','nora']);
    expect(await call('PATCH',{id:inside,body:{parent_team_id:id}})).toMatchObject({status:400,json:{detail:'A team can’t sit inside itself or a team inside it.'}});
    expect((await call('PATCH',{id,body:{name:'Counter'}})).json.teams.map((t:Team)=>t.name)).toContain('Counter');
    expect(await call('PATCH',{id:9999,body:{name:'X'}})).toMatchObject({status:404,json:{detail:'Team not found.'}});

    const added=await call('PUT',{id,members:true,body:{add:['eli']}});
    expect(teamNamed(added.json,'Counter').member_ids).toEqual(['eli','nora']);
    const removed=await call('PUT',{id,members:true,body:{remove:['eli','nora']}});
    expect(teamNamed(removed.json,'Counter').member_ids).toEqual([]);

    const deleted=await call('DELETE',{id});
    expect(deleted.json.teams.map((t:Team)=>t.name)).toEqual(['Inside Sales','Outside Sales']);
    expect(await call('DELETE',{id})).toMatchObject({status:404});
    await call('PUT',{id:teamNamed(deleted.json,'Outside Sales').id,members:true,body:{add:['eli','nora']}});
  });
});
