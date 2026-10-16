import {describe,expect,it,vi} from 'vitest';
import {readNdjson,requestMatch,searchCatalog} from './client';
import type {MatchStreamEvent} from './types';

// The browser side of the match stream: NDJSON split across chunks at any byte, one event per line,
// and the run's outcome (the result, or the error message) from requestMatch.

function streamOf(chunks:string[]){
  const encoder=new TextEncoder();
  return new ReadableStream<Uint8Array>({start(c){for(const chunk of chunks)c.enqueue(encoder.encode(chunk));c.close();}});
}

describe('readNdjson',()=>{
  it('yields one event per line, whatever the chunk boundaries (multi-byte characters included)',async()=>{
    const events=[{type:'progress',stage:'parse',done:0,total:1},{type:'error',message:'Zoë’s list'}];
    const text=events.map(e=>JSON.stringify(e)+'\n').join('');
    const bytes=new TextEncoder().encode(text);
    const pieces:Uint8Array[]=[];
    for(let i=0;i<bytes.length;i+=3)pieces.push(bytes.slice(i,i+3));
    const body=new ReadableStream<Uint8Array>({start(c){for(const p of pieces)c.enqueue(p);c.close();}});
    const seen:unknown[]=[];
    await readNdjson(body,e=>seen.push(e));
    expect(seen).toEqual(events);
  });

  it('reads a last line without a newline and skips blank lines',async()=>{
    const seen:unknown[]=[];
    await readNdjson(streamOf(['{"a":1}\n\n','{"b":2}']),e=>seen.push(e));
    expect(seen).toEqual([{a:1},{b:2}]);
  });
});

describe('requestMatch',()=>{
  const ndjson=(events:MatchStreamEvent[])=>new Response(streamOf(events.map(e=>JSON.stringify(e)+'\n')),{headers:{'content-type':'application/x-ndjson'}});

  it('reports progress and returns the run',async()=>{
    const run={level:'strict' as const,lines:[],counts:{rows:0,matched:0,unmatched:0,judged:0}};
    const fetcher=vi.fn(async()=>ndjson([{type:'progress',stage:'parse',done:0,total:1},{type:'result',run}]));
    const progress=vi.fn();
    const form=new FormData();form.set('text','boxes');
    expect(await requestMatch(form,progress,{fetcher})).toEqual({ok:true,run});
    expect(progress).toHaveBeenCalledWith({stage:'parse',done:0,total:1});
    expect(fetcher).toHaveBeenCalledWith('/api/quote-tool/match',expect.objectContaining({method:'POST',body:form}));
  });

  it('returns the stream\'s error message',async()=>{
    const fetcher=async()=>ndjson([{type:'error',message:'Could not read that list.'}]);
    expect(await requestMatch(new FormData(),()=>{},{fetcher})).toEqual({ok:false,error:'Could not read that list.'});
  });

  it('returns the JSON error of a refused request, and a plain message otherwise',async()=>{
    expect(await requestMatch(new FormData(),()=>{},{fetcher:async()=>Response.json({error:'This list has more than 200 lines.'},{status:413})}))
      .toEqual({ok:false,error:'This list has more than 200 lines.'});
    expect(await requestMatch(new FormData(),()=>{},{fetcher:async()=>new Response('<html>',{status:502})}))
      .toEqual({ok:false,error:expect.stringMatching(/try again/i)});
    expect(await requestMatch(new FormData(),()=>{},{fetcher:async()=>{throw new TypeError('network');}}))
      .toEqual({ok:false,error:expect.stringMatching(/connection/i)});
    expect(await requestMatch(new FormData(),()=>{},{fetcher:async()=>ndjson([{type:'progress',stage:'parse',done:0,total:1}])}))
      .toEqual({ok:false,error:expect.stringMatching(/try again/i)});
  });
});

describe('searchCatalog',()=>{
  it('sends the line\'s description with the query, so each result says whether it accounts for the line (B10b)',async()=>{
    const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({items:[]}),{status:200}));
    await searchCatalog('poly bags',{fetcher:fetcher as unknown as typeof fetch,line:'Bags 4x6 & 2 mil'});
    expect(fetcher.mock.calls[0][0]).toBe('/api/catalog/search?q=poly%20bags&line=Bags%204x6%20%26%202%20mil');
    await searchCatalog('poly bags',{fetcher:fetcher as unknown as typeof fetch});
    expect(fetcher.mock.calls[1][0]).toBe('/api/catalog/search?q=poly%20bags');
  });
});
