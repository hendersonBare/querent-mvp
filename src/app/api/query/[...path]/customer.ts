import 'server-only';
import {NextResponse,type NextRequest} from 'next/server';
import type {Principal} from '@/lib/contracts';
import {ask,ConversationNotFoundError} from '@/server/pipeline';
import {customerAccessRules,history} from '@/server/repository/customer';

// The customer API (/api/query/customer/...), for a signed-in customer contact. Customer routes use
// only the customer-safe repository module, so nothing here can return cost, margin or another
// customer's data (boundary.test.ts enforces it). Everything is scoped to the session's customer.

const fail=(detail:string,status=400)=>NextResponse.json({detail},{status});

/** Handles a customer request, or returns undefined when no customer route matches. */
export async function customerRoute(request:NextRequest,user:Principal&{customer_id:string},segments:string[]){
  const [area,name,id]=segments;
  if(area!=='customer')return undefined;
  if(request.method==='GET'&&name==='panel'&&segments.length===2)return NextResponse.json(customerAccessRules(user.customer_id));
  if(request.method==='GET'&&name==='history'&&id)return NextResponse.json(history(user.customer_id,id));
  if(request.method==='POST'&&name==='chat'&&segments.length===2){
    const body=await request.json().catch(()=>({}));
    if(typeof body.question!=='string'||!body.question.trim()||body.question.length>4000||typeof body.conversation_id!=='string'||!body.conversation_id.trim()||body.conversation_id.length>100)return fail('Enter a valid question.',422);
    try{return NextResponse.json(await ask(user.customer_id,body.conversation_id,body.question.trim(),{contactId:user.contact_id}));}
    catch(error){if(error instanceof ConversationNotFoundError)return fail('Conversation not found.',404);throw error;}
  }
  return undefined;
}
