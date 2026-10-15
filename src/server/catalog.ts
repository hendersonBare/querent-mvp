import 'server-only';
import {loadCatalog} from './repository/catalog';
import type {CatalogItem,Db} from './repository/types';

// The catalog in memory (docs/boxt/plan.md "Layout"). The catalog is the same for every signed-in user,
// so one copy serves all requests: loaded through the repository with the request's client at most once
// per TTL, one load shared by concurrent callers (single-flight). A failed or empty load is not cached.

export const CATALOG_TTL_MS=10*60*1000;

type Loader=()=>Promise<CatalogItem[]>;

export function createCatalogCache({ttlMs=CATALOG_TTL_MS,now=Date.now}:{ttlMs?:number;now?:()=>number}={}){
  let rows:CatalogItem[]|null=null;
  let loadedAt=0;
  let inflight:Promise<CatalogItem[]>|null=null;
  /** Bumped by clear(), so a load started before it cannot refill the cache. */
  let generation=0;
  return {
    get(load:Loader):Promise<CatalogItem[]>{
      if(rows&&now()-loadedAt<ttlMs)return Promise.resolve(rows);
      if(inflight)return inflight;
      const started=generation;
      const promise=load().then(result=>{
        if(started===generation&&result.length>0){rows=result;loadedAt=now();}
        return result;
      });
      inflight=promise;
      const settle=()=>{if(inflight===promise)inflight=null;};
      promise.then(settle,settle);
      return promise;
    },
    clear(){rows=null;inflight=null;generation++;},
  };
}

const shared=createCatalogCache();

/** The whole catalog, from memory when fresh. */
export const getCatalog=(db:Db)=>shared.get(()=>loadCatalog(db));

/** Forgets the cached catalog (e.g. after a catalog refresh). */
export const clearCatalogCache=()=>shared.clear();
