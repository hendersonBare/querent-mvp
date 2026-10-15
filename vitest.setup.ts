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
// The three feature flags (decision 48) are on unless the shell sets them, as on the Playwright server
// (OA-76), so the freight, recovery and preview tests run with what they govern in effect (decision 71).
// Tests of a flag that is off stub it themselves (vi.stubEnv).
for(const name of ['FEATURE_FREE_DELIVERY_PRICING','FEATURE_RECOVERY_POOL','FEATURE_DELIVERY_COST_MODEL'])process.env[name]??='1';
