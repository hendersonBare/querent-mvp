import {describe,expect,it} from 'vitest';
import {apiScope,sectionFor,scopeFrom,scopedHref} from './scope';

const customers=[{id:'wasatch'},{id:'great-basin'}];
const params=(query:string)=>new URLSearchParams(query);

describe('scopeFrom: the "Viewing" picker reads ?customer=',()=>{
  it('is null (All customers) without the param, with an empty one, or with "all"',()=>{
    expect(scopeFrom(params(''),customers)).toBeNull();
    expect(scopeFrom(params('customer='),customers)).toBeNull();
    expect(scopeFrom(params('customer=all'),customers)).toBeNull();
  });
  it('is the customer id when it names a known customer, and All customers otherwise',()=>{
    expect(scopeFrom(params('customer=wasatch&tab=data'),customers)).toBe('wasatch');
    expect(scopeFrom(params('customer=nobody'),customers)).toBeNull();
  });
  it('trusts the id when no customer list is given',()=>{
    expect(scopeFrom(params('customer=nobody'))).toBe('nobody');
  });
});

describe('scopedHref: portal links keep the picked customer',()=>{
  it('adds, replaces or removes ?customer= and keeps the other params',()=>{
    expect(scopedHref('/rep/settings','wasatch')).toBe('/rep/settings?customer=wasatch');
    expect(scopedHref('/rep/settings?tab=data','great-basin')).toBe('/rep/settings?tab=data&customer=great-basin');
    expect(scopedHref('/rep/settings?customer=wasatch&tab=data','great-basin')).toBe('/rep/settings?customer=great-basin&tab=data');
    expect(scopedHref('/rep/settings?customer=wasatch&tab=data',null)).toBe('/rep/settings?tab=data');
    expect(scopedHref('/rep/quotes',null)).toBe('/rep/quotes');
  });
  it('encodes the id',()=>{
    expect(scopedHref('/rep/quotes','a b&c')).toBe('/rep/quotes?customer=a+b%26c');
  });
});

describe('apiScope and sectionFor',()=>{
  it("maps the picker to the supplier API's scope segment",()=>{
    expect(apiScope(null)).toBe('all');
    expect(apiScope('wasatch')).toBe('wasatch');
  });
  it('finds the nav section for a path, including its sub-pages',()=>{
    expect(sectionFor('/rep/quotes')?.label).toBe('Quotes');
    expect(sectionFor('/rep/quotes/Q-24817')?.label).toBe('Quotes');
    expect(sectionFor('/rep/settings')?.label).toBe('Settings');
    expect(sectionFor('/rep/quotesque')).toBeUndefined();
    expect(sectionFor('/rep')).toBeUndefined();
  });
});
