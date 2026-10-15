import {describe,expect,it} from 'vitest';
import * as scope from './scope';
import {customerFilter,sectionFor,sectionsFor,shortName,withCustomer} from './scope';

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

// The rail's nav (plan U2; C_QOBoard for the manager, C_RQBoard for a rep; decision 46 renames).
describe('sectionsFor: the rail nav by role',()=>{
  it('gives the manager Quotes, Customers, Orders, Stock, Analytics, Teams and Reps, Settings',()=>{
    expect(sectionsFor(true).map(s=>[s.label,s.href])).toEqual([
      ['Quotes','/rep/quotes'],['Customers','/rep/customers'],['Orders','/rep/orders'],['Stock','/rep/stock'],
      ['Analytics','/rep/analytics'],['Teams and Reps','/rep/teams'],['Settings','/rep/settings']]);
  });
  it('gives a rep My Analytics and no Teams and Reps',()=>{
    expect(sectionsFor(false).map(s=>[s.label,s.href])).toEqual([
      ['Quotes','/rep/quotes'],['Customers','/rep/customers'],['Orders','/rep/orders'],['Stock','/rep/stock'],
      ['My Analytics','/rep/analytics'],['Settings','/rep/settings']]);
  });
  it('draws each section with its frame icon path',()=>{
    for(const section of sectionsFor(true))expect(section.icon).toMatch(/^M/);
    expect(sectionsFor(true).find(s=>s.id==='stock')?.icon).toBe('M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z');
  });
  it('finds Stock and Teams and Reps for their pages; the old paths are no section',()=>{
    expect(sectionFor('/rep/stock/HCS-12-13-2G8')?.id).toBe('stock');
    expect(sectionFor('/rep/teams')?.id).toBe('teams');
    expect(sectionFor('/rep/items')).toBeUndefined();
    expect(sectionFor('/rep/team')).toBeUndefined();
  });
});

describe('shortName: the rail user block\'s name (C_QOBoard "Brian G.")',()=>{
  it('is the first name and the last name\'s initial',()=>{
    expect(shortName('Brandi Gallegos')).toBe('Brandi G.');
    expect(shortName('Mara Jensen')).toBe('Mara J.');
    expect(shortName('Mary Ann de Vries')).toBe('Mary V.');
    expect(shortName('Cher')).toBe('Cher');
    expect(shortName('  ')).toBe('');
  });
});
