import 'server-only';
import type {NextRequest} from 'next/server';
import type {ApiSession} from '@/features/auth/server';
import {matchConfig} from '@/features/settings/strictness';
import {getCatalog} from '@/server/catalog';
import {getJudge,getParser,type ParseInput} from '@/server/llm';
import {getOrgSettings,logActivity} from '@/server/repository';
import {runPipeline,type PipelineResult} from './pipeline';
import {MAX_LIST_CHARS,MAX_LIST_LINES,MAX_PDF_BYTES,PDF_UPLOAD_TYPES,countListLines,hasPdfMagic,type MatchStreamEvent} from './types';

// POST /api/quote-tool/match (docs/boxt/plan.md "API"): takes a pasted list (multipart field `text`) or
// a PDF (field `file`), checks the caps, reads the organization's match strictness and the catalog, runs
// the pipeline and streams NDJSON, one JSON object per line:
//
//   {"type":"progress","stage":"parse"|"match"|"judge","done":n,"total":m}   (any number)
//   {"type":"result","run":{"level":…,"lines":[…],"counts":{…}}}            (last line), or
//   {"type":"error","message":"…"}                                           (last line)
//
// Input problems are answered before the stream starts, as JSON {error} with 400 or 413. The list and the
// PDF stay in memory for this request only: they are never stored or logged. One match_run activity row
// records the run with numbers and fixed words (sanitize.ts): rows, matched, unmatched, judged, level,
// input ('text'|'pdf'), durationMs and outcome ('success'|'failure'|'timeout').

export const EMPTY_INPUT_ERROR='Paste a list or upload a PDF.';
export const BOTH_INPUTS_ERROR='Paste a list or upload a PDF, not both.';
export const NOT_A_FORM_ERROR='Send the list as a form, with a pasted list or a PDF.';
export const NOT_PDF_ERROR='Only PDF files can be uploaded. Paste the list as text instead.';
export const PDF_TOO_LARGE='That PDF is larger than 4 MB. Upload a smaller file, or paste the list as text.';
export const TOO_MANY_LINES_ERROR=`This list has more than ${MAX_LIST_LINES} lines. Split it into smaller lists of up to ${MAX_LIST_LINES} lines each.`;
export const TOO_LONG_ERROR=`This list is too long. Paste up to ${MAX_LIST_LINES} lines of up to a few hundred characters each.`;
export const SETUP_ERROR='The quote tool could not load the catalog or the match settings. Try again in a minute.';
export const RUN_ERROR='Something went wrong while matching. Try again.';

/** Room for the multipart framing around a 4 MB PDF. */
const MAX_BODY_BYTES=MAX_PDF_BYTES+256*1024;

const NO_STORE={'cache-control':'no-store'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers:NO_STORE});

type Input={kind:'text';input:ParseInput}|{kind:'pdf';input:ParseInput};

/** The list from the request, or the 400/413 response to answer. */
async function readInput(request:NextRequest):Promise<Input|Response>{
  const length=Number(request.headers.get('content-length')??'');
  if(Number.isFinite(length)&&length>MAX_BODY_BYTES)return fail(413,PDF_TOO_LARGE);
  if(!(request.headers.get('content-type')??'').toLowerCase().includes('multipart/form-data'))return fail(400,NOT_A_FORM_ERROR);
  let form:FormData;
  try{form=await request.formData();}catch{return fail(400,NOT_A_FORM_ERROR);}
  const file=form.get('file');
  const text=form.get('text');
  const hasText=typeof text==='string'&&text.trim()!=='';
  if(file instanceof Blob&&file.size>0){
    if(hasText)return fail(400,BOTH_INPUTS_ERROR);
    if(file.size>MAX_PDF_BYTES)return fail(413,PDF_TOO_LARGE);
    // application/pdf, or a generic type (octet-stream, none) that some browsers give a PDF; the bytes decide.
    if(!PDF_UPLOAD_TYPES.includes(file.type.toLowerCase()))return fail(400,NOT_PDF_ERROR);
    const data=new Uint8Array(await file.arrayBuffer());
    if(!hasPdfMagic(data))return fail(400,NOT_PDF_ERROR);
    return {kind:'pdf',input:{kind:'pdf',data}};
  }
  if(!hasText)return fail(400,EMPTY_INPUT_ERROR);
  if(text.length>MAX_LIST_CHARS)return fail(413,TOO_LONG_ERROR);
  if(countListLines(text)>MAX_LIST_LINES)return fail(413,TOO_MANY_LINES_ERROR);
  return {kind:'text',input:{kind:'text',text}};
}

export async function handleMatch(request:NextRequest,{db}:ApiSession):Promise<Response>{
  const started=performance.now();
  const input=await readInput(request);
  if(input instanceof Response)return input;

  let level,catalog;
  try{
    level=(await getOrgSettings(db)).matchStrictness;
    catalog=await getCatalog(db);
  }catch{
    return fail(500,SETUP_ERROR);
  }
  if(catalog.length===0)return fail(500,SETUP_ERROR);
  const config=matchConfig(level);

  const abort=new AbortController();
  request.signal?.addEventListener('abort',()=>abort.abort(),{once:true});
  const encoder=new TextEncoder();

  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      const send=(event:MatchStreamEvent)=>{
        try{controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));}catch{/* the client went away */}
      };
      void (async()=>{
        let result:PipelineResult;
        try{
          result=await runPipeline(input.input,{
            parser:getParser(),judge:getJudge(),catalog,config,signal:abort.signal,
            onProgress:event=>send({type:'progress',...event}),
          });
        }catch{
          result={ok:false,error:RUN_ERROR,timedOut:false};
        }
        if(result.ok)send({type:'result',run:{level,lines:result.lines,counts:result.counts}});
        else send({type:'error',message:result.error});
        const counts=result.ok?result.counts:{rows:0,matched:0,unmatched:0,judged:0};
        await logActivity(db,'match_run',{
          ...counts,level,input:input.kind,durationMs:Math.round(performance.now()-started),
          outcome:result.ok?'success':result.timedOut?'timeout':'failure',
        });
        try{controller.close();}catch{/* already closed */}
      })();
    },
    cancel(){abort.abort();},
  });

  return new Response(stream,{headers:{'content-type':'application/x-ndjson; charset=utf-8',...NO_STORE,'x-accel-buffering':'no','x-content-type-options':'nosniff'}});
}
