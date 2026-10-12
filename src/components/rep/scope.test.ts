import {describe,expect,it} from 'vitest';
import * as scope from './scope';
import {customerFilter,sectionFor,withCustomer} from './scope';

const params=(query:string)=>new URLSearchParams(query);

// Scope is role based on the server (task U1): ?customer= is only a page's own filter, and nothing
// carries it (or the old ?scope=all) from page to page.
describe('the old "Viewing" picker and All reps scope are gone (task U1)',()=>{
  it('exports no picker or All reps helpers',()=>{
    for(const name of ['SCOPE_PARAM','REPS_PARAM','ALL_REPS','isAllReps','scopeFrom','scopedHref'])expect(scope).not.toHaveProperty(name);
  });
  it('nav sections are plain paths',()=>{
    for(const section of scope.REP_SECTIONS)expect(section.href).not.toContain('?');
  });
});

describe('customerFilter: a page reads its own ?customer=',()=>{
  it('is null without the param, with an empty one, or with "all"',()=>{
    expect(customerFilter(params(''))).toBeNull();
    expect(customerFilter(params('customer='))).toBeNull();
    expect(customerFilter(params('customer=all'))).toBeNull();
  });
  it('is the id as given; the server checks it against what the rep may read',()=>{
    expect(customerFilter(params('customer=wasatch&tab=data'))).toBe('wasatch');
  });
});

describe('withCustomer: a link that filters one page by customer',()=>{
  it('adds, replaces or removes ?customer= and keeps the other params',()=>{
    expect(withCustomer('/rep/quotes','wasatch')).toBe('/rep/quotes?customer=wasatch');
    expect(withCustomer('/rep/settings?tab=access','great-basin')).toBe('/rep/settings?tab=access&customer=great-basin');
    expect(withCustomer('/rep/settings?customer=wasatch&tab=access',null)).toBe('/rep/settings?tab=access');
    expect(withCustomer('/rep/quotes','a b&c')).toBe('/rep/quotes?customer=a+b%26c');
  });
});

describe('sectionFor',()=>{
  it('finds the nav section for a path, including its sub-pages',()=>{
    expect(sectionFor('/rep/quotes')?.label).toBe('Quotes');
    expect(sectionFor('/rep/quotes/Q-24817')?.label).toBe('Quotes');
    expect(sectionFor('/rep/settings')?.label).toBe('Settings');
    expect(sectionFor('/rep/quotesque')).toBeUndefined();
    expect(sectionFor('/rep')).toBeUndefined();
  });
});
