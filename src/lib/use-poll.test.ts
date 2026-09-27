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

/** Makes the page look hidden or visible, and tells listeners, as the browser does when the tab changes. */
function setVisibility(state:'hidden'|'visible'){
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>state});
 document.dispatchEvent(new Event('visibilitychange'));
}

it('skips polls while the tab is hidden, and polls again as soon as it is shown',async()=>{
 vi.useFakeTimers();
 try{
  const load=vi.fn().mockResolvedValue('x');
  const {unmount}=renderHook(()=>usePoll(load,1000));
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(load).toHaveBeenCalledTimes(3);
  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(load).toHaveBeenCalledTimes(3);
  setVisibility('visible');
  expect(load).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(1000);
  expect(load).toHaveBeenCalledTimes(5);
  // Unmounted: no more polls, and no listener left behind.
  unmount();
  setVisibility('hidden');setVisibility('visible');
  await vi.advanceTimersByTimeAsync(5000);
  expect(load).toHaveBeenCalledTimes(5);
 }finally{
  vi.useRealTimers();
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});
 }
});
