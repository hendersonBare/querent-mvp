import 'server-only';

// A double-submit guard for rep actions that create something (task 3.5: Duplicate quote). The
// page sends an Idempotency-Key header with each attempt; a request that repeats a key within
// the time to live gets the first result back instead of doing the work again, so a double
// click or a retried request makes one copy, not two.
//
// Results live in this server process's memory: nothing is written to the database (no schema
// change), and a restart forgets them, which only matters for a retry that spans the restart.
// better-sqlite3 is synchronous, so the check and the work can't interleave between requests.

/** A key: 1 to 128 letters, digits, '-', '_', ':' or '.' (a UUID fits). */
const KEY=/^[\w.:-]{1,128}$/;

/**
 * The Idempotency-Key header, trimmed: null when missing or blank (no guard), undefined when
 * malformed (the route answers 400).
 */
export function parseIdempotencyKey(header:string|null|undefined):string|null|undefined{
  const key=header?.trim()??'';
  if(!key)return null;
  return KEY.test(key)?key:undefined;
}

export interface IdempotencyOptions {
  /** How long a result is replayed. Ten minutes by default: far longer than any double click or retry. */
  ttlMs?:number;
  /** The most results kept; the oldest goes first. */
  maxEntries?:number;
  /** Milliseconds, for tests. */
  clock?:()=>number;
}

export class IdempotencyStore{
  private readonly entries=new Map<string,{at:number;value:unknown}>();
  private readonly ttlMs:number;
  private readonly maxEntries:number;
  private readonly clock:()=>number;

  constructor({ttlMs=10*60_000,maxEntries=1000,clock=Date.now}:IdempotencyOptions={}){
    this.ttlMs=ttlMs;this.maxEntries=maxEntries;this.clock=clock;
  }

  get size(){return this.entries.size;}

  /**
   * Runs `work` unless `key` was already used in `scope` (e.g. the rep and the source quote),
   * in which case it returns that run's result with replayed: true. Without a key it always
   * runs. A run that throws is not remembered, so the same key can try again.
   */
  once<T>(scope:string,key:string|null,work:()=>T):{value:T;replayed:boolean}{
    if(key===null)return {value:work(),replayed:false};
    const now=this.clock();
    this.prune(now);
    const id=`${scope}\u0000${key}`;
    const hit=this.entries.get(id);
    if(hit)return {value:hit.value as T,replayed:true};
    const value=work();
    this.entries.set(id,{at:now,value});
    while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value!);
    return {value,replayed:false};
  }

  /** Drops expired results (the map is in insertion order, so the oldest come first). */
  private prune(now:number){
    for(const [id,entry] of this.entries){
      if(now-entry.at<this.ttlMs)break;
      this.entries.delete(id);
    }
  }
}
