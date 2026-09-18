import type {API} from './contracts';
export function createAPI(onUnauthorized?:()=>void):API {
  async function request<T>(path:string, method:string, body?:unknown):Promise<T> {
    const response=await fetch(`/api/query/${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const result=await response.json();
    if(!response.ok) {
      if(response.status===401) onUnauthorized?.();
      throw new Error(typeof result.detail==='string'?result.detail:'The request could not be completed. Please try again.');
    }
    return result as T;
  }
  return {get:<T>(path:string)=>request<T>(path,'GET'),send:<T>(path:string,method:'POST'|'PUT',body:unknown)=>request<T>(path,method,body)};
}
