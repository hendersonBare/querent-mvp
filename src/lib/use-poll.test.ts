import {renderHook,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {usePoll} from './use-poll';
it('ignores a stale response that resolves after the load function has changed',async()=>{
 let resolveStale!:(value:string)=>void;
 const stale=new Promise<string>(resolve=>{resolveStale=resolve;});
 const loadStale=vi.fn(()=>stale);
 const loadFresh=vi.fn().mockResolvedValue('fresh');
 const {result,rerender}=renderHook(({fn}:{fn:()=>Promise<string>})=>usePoll(fn,1000000),{initialProps:{fn:loadStale}});
 await waitFor(()=>expect(loadStale).toHaveBeenCalled());
 rerender({fn:loadFresh});
 await waitFor(()=>expect(result.current.data).toBe('fresh'));
 resolveStale('stale');
 await new Promise(r=>setTimeout(r,10));
 expect(result.current.data).toBe('fresh');
});
