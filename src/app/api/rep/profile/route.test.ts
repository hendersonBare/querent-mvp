import {readFileSync} from 'node:fs';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// Settings > Profile and Notifications (plan U9; C_RS2, C_RS4; Appendix D "GET/PUT rep profile and picture",
// "GET/PUT notification preferences"): the signed-in rep's own only, from the session (no rep id is read from
// the request). 401 without a session, 403 for a customer, never cached. The picture is checked by its bytes
// (PNG, JPEG or WebP, 2 MB at most) and served back with its own type, never sniffed, sandboxed.
useSeededDatabase();

const fixture=(name:string)=>new Uint8Array(readFileSync(path.join(process.cwd(),'test/fixtures/pictures',name)));
const join=(...parts:(Uint8Array|number[]|string)[])=>Uint8Array.from(parts.flatMap(p=>[...(typeof p==='string'?new TextEncoder().encode(p):p)]));
/** Real 2x2 pictures (test/fixtures/pictures). */
const PNG=fixture('tiny.png'),JPEG=fixture('tiny.jpg'),WEBP=fixture('tiny-lossy.webp');
const SVG=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const HTML=new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
const SVG_TEXT='<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>';
const le=(n:number)=>[n&255,n>>>8&255,n>>>16&255,n>>>24&255];
/** Files that start like a picture but are not one (a polyglot, a truncated file, data after the image's end). */
const NOT_PICTURES:[string,Uint8Array][]=[
  ['PNG signature then HTML',join(PNG.subarray(0,8),'<html><script>alert(1)</script></html>')],
  ['JPEG start then HTML',join([0xff,0xd8,0xff],'<html><script>alert(1)</script></html>')],
  ['WebP header then SVG',join('RIFF',le(4+SVG_TEXT.length),'WEBP',SVG_TEXT)],
  ['20-byte PNG',PNG.subarray(0,20)],
  ['8-byte PNG signature',PNG.subarray(0,8)],
  ['HTML after IEND',join(PNG,HTML)],
  ['HTML after EOI',join(JPEG,HTML)],
  ['JPEG without EOI',JPEG.subarray(0,JPEG.length-2)],
  ['WebP cut short',WEBP.subarray(0,WEBP.length-4)],
];

type Method='GET'|'PUT'|'DELETE';
const ROUTES={
  profile:{load:()=>import('./route'),url:'/api/rep/profile'},
  picture:{load:()=>import('./picture/route'),url:'/api/rep/profile/picture'},
  prefs:{load:()=>import('../notification-prefs/route'),url:'/api/rep/notification-prefs'},
} as const;
type Name=keyof typeof ROUTES;

async function call(name:Name,method:Method,{body,raw,type,persona='mara',query=''}:{body?:unknown;raw?:Uint8Array;type?:string;persona?:string|null;query?:string}={}){
  const route=await ROUTES[name].load() as Partial<Record<Method,(request:NextRequest)=>Promise<Response>>>;
  const handler=route[method];
  if(!handler)throw new Error(`No ${method} on ${name}`);
  const headers:Record<string,string>={};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(raw)headers['content-type']=type??'application/octet-stream';
  else if(body!==undefined)headers['content-type']='application/json';
  const response=await handler(new NextRequest(`http://127.0.0.1${ROUTES[name].url}${query}`,{method,headers,body:raw?Buffer.from(raw):body===undefined?undefined:JSON.stringify(body)}));
  const bytes=new Uint8Array(await response.arrayBuffer());
  const text=new TextDecoder().decode(bytes);
  let json:unknown=null;
  try{json=JSON.parse(text);}catch{/* a picture */}
  return {status:response.status,headers:response.headers,bytes,json:json as Record<string,unknown>&{detail?:string}};
}

describe('GET and PUT /api/rep/profile',()=>{
  it("reads the signed-in rep's own profile, never cached",async()=>{
    const {status,headers,json}=await call('profile','GET');
    expect(status).toBe(200);
    expect(headers.get('cache-control')).toMatch(/no-store/);
    expect(json).toEqual({name:'Mara Jensen',initials:'MJ',title:'Inside Sales',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com',picture_url:null});
  });

  it('saves the name, phone and email of the signed-in rep only, whatever rep the body names',async()=>{
    const saved=await call('profile','PUT',{body:{rep_id:'eli',name:'Mara Quinn',phone:'(801) 555-0199',email:'mara.quinn@example.com'}});
    expect(saved).toMatchObject({status:200,json:{name:'Mara Quinn',initials:'MQ',phone:'(801) 555-0199',email:'mara.quinn@example.com'}});
    expect((await call('profile','GET',{persona:'eli'})).json).toMatchObject({name:'Eli Porter',phone:'(801) 555-0103'});
    expect((await call('profile','PUT',{body:{name:'Mara Jensen',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com'}})).status).toBe(200);
  });

  it('refuses a bad field with its name, and a body that is not JSON',async()=>{
    expect(await call('profile','PUT',{body:{name:'',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com'}})).toMatchObject({status:400,json:{detail:'Enter your name.',field:'name'}});
    expect(await call('profile','PUT',{body:{name:'Mara Jensen',phone:'(801) 555-0102',email:'nope'}})).toMatchObject({status:400,json:{detail:'Enter an email address.',field:'email'}});
    expect((await call('profile','PUT',{raw:new TextEncoder().encode('not json'),type:'application/json'})).status).toBe(400);
    expect((await call('profile','GET')).json).toMatchObject({name:'Mara Jensen',email:'mara.jensen@herrickindustrial.com'});
  });
});

describe('PUT, GET and DELETE /api/rep/profile/picture',()=>{
  it('stores a PNG sent as the body, serves it back with its own type, sandboxed and never sniffed, and removes it',async()=>{
    expect((await call('picture','GET')).status).toBe(404);
    const saved=await call('picture','PUT',{raw:PNG,type:'image/png'});
    expect(saved.status).toBe(200);
    expect(saved.json.picture_url).toMatch(/^\/api\/rep\/profile\/picture\?v=\d+$/);
    const served=await call('picture','GET',{query:'?v=1'});
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(served.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
    expect(served.headers.get('content-security-policy')).toMatch(/sandbox/);
    expect(served.headers.get('cache-control')).toMatch(/private/);
    expect(Buffer.from(served.bytes).equals(Buffer.from(PNG))).toBe(true);
    // Another rep has none: the route serves the signed-in rep's own picture only.
    expect((await call('picture','GET',{persona:'eli'})).status).toBe(404);
    const removed=await call('picture','DELETE');
    expect(removed).toMatchObject({status:200,json:{picture_url:null}});
    expect((await call('picture','GET')).status).toBe(404);
  });

  it('stores a JPEG and a WebP, each served with its own type',async()=>{
    for(const [raw,type] of [[JPEG,'image/jpeg'],[WEBP,'image/webp']] as const){
      expect((await call('picture','PUT',{raw,type:'application/octet-stream'})).status,type).toBe(200);
      const served=await call('picture','GET');
      expect(served.headers.get('content-type')).toBe(type);
      expect(Buffer.from(served.bytes).equals(Buffer.from(raw))).toBe(true);
    }
    expect((await call('picture','DELETE')).status).toBe(200);
  });

  it('refuses a polyglot, a truncated picture and data after the end of the image, keeping the picture there was',async()=>{
    expect((await call('picture','PUT',{raw:PNG,type:'image/png'})).status).toBe(200);
    for(const [name,raw] of NOT_PICTURES)
      expect(await call('picture','PUT',{raw,type:'image/png'}),name).toMatchObject({status:400,json:{detail:'Pick a PNG, JPEG or WebP picture.',field:'picture'}});
    const served=await call('picture','GET');
    expect(Buffer.from(served.bytes).equals(Buffer.from(PNG))).toBe(true);
    expect((await call('picture','DELETE')).status).toBe(200);
  });

  it('refuses an SVG, HTML or anything else by its bytes, whatever type it claims, and anything over 2 MB',async()=>{
    for(const [raw,type] of [[SVG,'image/svg+xml'],[SVG,'image/png'],[HTML,'image/jpeg'],[new Uint8Array(),'image/png']] as const)
      expect(await call('picture','PUT',{raw,type}),type).toMatchObject({status:400,json:{detail:'Pick a PNG, JPEG or WebP picture.',field:'picture'}});
    const big=new Uint8Array(2*1024*1024+1);big.set(PNG);
    expect(await call('picture','PUT',{raw:big,type:'image/png'})).toMatchObject({status:413,json:{detail:'Pick a picture of 2 MB or less.',field:'picture'}});
    expect((await call('picture','GET')).status).toBe(404);
  });
});

describe('GET and PUT /api/rep/notification-prefs',()=>{
  const ALL_ON={quote_overdue:true,quote_aging:true,below_margin_floor:true,change_requested:true,quote_accepted:true,quote_declined:true,quote_expired:true,customer_chat_needs_rep:true};

  it("reads and saves the signed-in rep's own switches, every one on until turned off",async()=>{
    expect(await call('prefs','GET')).toMatchObject({status:200,json:ALL_ON});
    expect(await call('prefs','PUT',{body:{quote_aging:false}})).toMatchObject({status:200,json:{...ALL_ON,quote_aging:false}});
    expect((await call('prefs','GET',{persona:'eli'})).json).toEqual(ALL_ON);
    expect((await call('prefs','PUT',{body:{quote_aging:true}})).json).toEqual(ALL_ON);
  });

  it('refuses an unknown event or a value that is not on or off',async()=>{
    for(const body of [{},{email_quote_aging:false},{quote_aging:'off'},[]])expect((await call('prefs','PUT',{body})).status,JSON.stringify(body)).toBe(400);
  });
});

describe('who may call them',()=>{
  const every:[Name,Method,{body?:unknown;raw?:Uint8Array;type?:string}][]=[
    ['profile','GET',{}],['profile','PUT',{body:{name:'X',phone:'(801) 555-0000',email:'x@example.com'}}],
    ['picture','GET',{}],['picture','PUT',{raw:PNG,type:'image/png'}],['picture','DELETE',{}],
    ['prefs','GET',{}],['prefs','PUT',{body:{quote_aging:false}}],
  ];
  it('asks for a workspace without a session, and refuses the customer persona, changing nothing',async()=>{
    for(const [name,method,options] of every){
      expect((await call(name,method,{...options,persona:null})).status,`${method} ${name}`).toBe(401);
      expect((await call(name,method,{...options,persona:'customer'})).status,`${method} ${name}`).toBe(403);
    }
    expect((await call('profile','GET')).json).toMatchObject({name:'Mara Jensen',picture_url:null});
    expect((await call('prefs','GET')).json).toMatchObject({quote_aging:true});
  });
});
