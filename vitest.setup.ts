import '@testing-library/jest-dom/vitest';
import {cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
// DOM polyfills for jsdom. Tests that opt into `@vitest-environment node` (e.g. PDF rendering,
// where react-pdf's browser build writes broken streams under jsdom) have no window.
if(typeof window!=='undefined'){
  if(!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView=()=>{};
  if(!window.matchMedia) window.matchMedia=(query:string)=>({matches:false,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent:()=>false}) as unknown as MediaQueryList;
}
afterEach(cleanup);
// No test may reach the real fuel price API (decision 30): the client builds its HTTP source only
// when OILPRICEAPI_KEY is set, so a key in the developer's shell is dropped here. Tests that need
// the source pass a fake, or stub the key and fetch themselves.
delete process.env.OILPRICEAPI_KEY;
