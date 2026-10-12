import {describe,expect,it} from 'vitest';
import config from '../../../next.config';

// Decision 46 (plan U2): /rep/items is /rep/stock and /rep/team is /rep/teams, with permanent (308)
// redirects from the old paths, sub-paths included. Next passes the query string through.
// e2e/frames-shell.spec.ts checks the 308 and the query on the running server.
describe('next.config redirects',()=>{
  it('sends the old rep paths to the new ones permanently',async()=>{
    expect(await config.redirects?.()).toEqual(expect.arrayContaining([
      {source:'/rep/items',destination:'/rep/stock',permanent:true},
      {source:'/rep/items/:path*',destination:'/rep/stock/:path*',permanent:true},
      {source:'/rep/team',destination:'/rep/teams',permanent:true},
    ]));
  });
});
