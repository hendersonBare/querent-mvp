import type {TeamsBoard} from '@/server/rep/teams';

// Teams and Reps' calls (plan U7). Each write goes to its backing route and the board is read back
// (or comes back with the write), so the page always shows what the server stored. A refusal throws
// with the server's own reason, which the page shows in one red line (decision 52).

async function send<T>(url:string,method:string,body?:unknown):Promise<T>{
  let response:Response;
  try{
    response=await fetch(url,{method,cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  }catch{throw new Error('No answer from the server. Check your connection and try again.');}
  if(response.status===401){window.location.assign('/');throw new Error('Signed out.');}
  const json=await response.json().catch(()=>null) as (T&{detail?:string})|null;
  if(!response.ok||json===null)throw new Error(typeof json?.detail==='string'?json.detail:'That change wasn’t saved. Try again.');
  return json;
}

/** GET /api/rep/teams. */
export const loadBoard=()=>send<TeamsBoard>('/api/rep/teams','GET');

/** PUT /api/rep/settings/assignments: the customer's one rep, its open quotes moved too when asked; then the board. */
export async function assignCustomer(customerId:string,repId:string,moveOpenQuotes:boolean){
  await send('/api/rep/settings/assignments','PUT',{customer_id:customerId,rep_id:repId,...(moveOpenQuotes?{moveOpenQuotes:true}:{})});
  return loadBoard();
}

/** PUT /api/rep/team/reps/<id> {active}: one rep's active flag (refused while they have customers). */
export const saveActive=(repId:string,active:boolean)=>send(`/api/rep/team/reps/${encodeURIComponent(repId)}`,'PUT',{active});

export const createTeam=(body:{name:string;rep_ids:string[];parent_team_id:number|null})=>send<TeamsBoard>('/api/rep/teams','POST',body);
export const moveTeam=(id:number,parentId:number|null)=>send<TeamsBoard>(`/api/rep/teams/${id}`,'PATCH',{parent_team_id:parentId});
export const changeMembers=(id:number,body:{add:string[]}|{remove:string[]})=>send<TeamsBoard>(`/api/rep/teams/${id}/members`,'PUT',body);
