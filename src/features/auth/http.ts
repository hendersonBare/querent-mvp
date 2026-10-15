import 'server-only';

// Small HTTP helpers for the auth route handlers: they accept JSON (the forms' fetch) or a plain form
// post (no JavaScript), and answer JSON or a 303 redirect to match. Nothing here is cached.

export interface AuthBody {
  /** The fields posted, whatever the encoding. */
  fields:Record<string,unknown>;
  /** true for a plain HTML form post: answer with a redirect instead of JSON. */
  form:boolean;
}

export async function readBody(request:Request):Promise<AuthBody>{
  const type=request.headers.get('content-type')??'';
  if(type.includes('application/x-www-form-urlencoded')||type.includes('multipart/form-data')){
    try{
      const data=await request.formData();
      return {form:true,fields:Object.fromEntries([...data.entries()].filter(([,value])=>typeof value==='string'))};
    }catch{
      return {form:true,fields:{}};
    }
  }
  try{
    const parsed:unknown=await request.json();
    return {form:false,fields:parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{}};
  }catch{
    return {form:false,fields:{}};
  }
}

/** A field as a string ('' when missing or not a string). */
export const text=(value:unknown)=>typeof value==='string'?value:'';

export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});

/**
 * 303 See Other to a path on this app (after a form post, the browser follows it with a GET). The
 * Location is relative on purpose: NextRequest reports 127.0.0.1 as localhost in request.url, and an
 * absolute redirect built from it would move the browser to another host, away from its cookies.
 */
export function seeOther(path:string):Response{
  if(!path.startsWith('/')||path.startsWith('//'))throw new Error('seeOther takes a path on this app.');
  return new Response(null,{status:303,headers:{location:path,'cache-control':'no-store'}});
}

/** This app's origin as the browser sees it (behind a reverse proxy, from the forwarded headers). */
export function appOrigin(request:Request):string{
  const url=new URL(request.url);
  const host=request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()||request.headers.get('host')||url.host;
  const proto=request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()||url.protocol.replace(':','');
  return `${proto}://${host}`;
}
