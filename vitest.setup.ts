import '@testing-library/jest-dom/vitest';
import {cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
// DOM polyfills for jsdom. Tests that opt into `@vitest-environment node` have no window.
if(typeof window!=='undefined'){
  if(!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView=()=>{};
  if(!window.matchMedia) window.matchMedia=(query:string)=>({matches:false,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent:()=>false}) as unknown as MediaQueryList;
}
afterEach(cleanup);
