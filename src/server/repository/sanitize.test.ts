// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {ACTIVITY_ACTIONS,METADATA_ENUMS,MAX_METADATA_KEYS,isActivityAction,sanitizeActivityMetadata} from './sanitize';

// Activity metadata carries counts, scores, thresholds, flags and a few known enum values, never
// customer text (docs/boxt/plan.md "Database", product rule 8). The sanitizer keeps finite numbers,
// booleans, null and strings from METADATA_ENUMS under identifier-like keys; everything else is dropped.

describe('sanitizeActivityMetadata',()=>{
  it('keeps numbers, booleans, null and known enum values',()=>{
    expect(sanitizeActivityMetadata({lines:12,matched:9,minScore:0.62,scripted:true,level:'strict',input:'pdf',previous:null}))
      .toEqual({lines:12,matched:9,minScore:0.62,scripted:true,level:'strict',input:'pdf',previous:null});
  });

  it('drops free text, even short text that could be a customer or a line',()=>{
    expect(sanitizeActivityMetadata({customer:'Acme Ltd',reference:'PO-1234',line:'12x10x8 RSC',name:'acme',email:'a@b.co',level:'strict'}))
      .toEqual({level:'strict'});
  });

  it('drops nested objects and arrays, which could hide text',()=>{
    expect(sanitizeActivityMetadata({lines:[{text:'tape'}],quote:{customer:'Acme'},skus:['M1044'],count:2})).toEqual({count:2});
  });

  it('drops non-finite numbers, bigints, dates, functions and undefined',()=>{
    expect(sanitizeActivityMetadata({a:Number.NaN,b:Infinity,c:BigInt(1),d:new Date(0),e:()=>1,f:undefined,g:-3})).toEqual({g:-3});
  });

  it('drops keys that are not short identifiers (a key can carry text too)',()=>{
    expect(sanitizeActivityMetadata({'Acme Ltd':1,'12x10x8 box':2,ok_key:3,['x'.repeat(41)]:4,lineCount:5})).toEqual({ok_key:3,lineCount:5});
  });

  it(`keeps at most ${MAX_METADATA_KEYS} keys`,()=>{
    const many=Object.fromEntries(Array.from({length:MAX_METADATA_KEYS+10},(_,i)=>[`k${i}`,i]));
    expect(Object.keys(sanitizeActivityMetadata(many))).toHaveLength(MAX_METADATA_KEYS);
  });

  it('accepts nothing at all, and anything that is not a plain object, as {}',()=>{
    expect(sanitizeActivityMetadata(undefined)).toEqual({});
    expect(sanitizeActivityMetadata(null)).toEqual({});
    expect(sanitizeActivityMetadata('Acme' as unknown as Record<string,unknown>)).toEqual({});
    expect(sanitizeActivityMetadata(['a'] as unknown as Record<string,unknown>)).toEqual({});
  });

  it('enum values are short lower-case identifiers, so none of them can be customer text',()=>{
    for(const value of METADATA_ENUMS)expect(value).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
    expect(METADATA_ENUMS).toEqual(expect.arrayContaining(['strict','balanced','lenient','text','pdf','auto','rep']));
  });

  it('keeps the sign-in method (B2 logs login with {method:"password"})',()=>{
    expect(sanitizeActivityMetadata({method:'password'})).toEqual({method:'password'});
  });
});

describe('activity actions',()=>{
  it('are the plan\'s seven',()=>{
    expect([...ACTIVITY_ACTIONS]).toEqual(['login','logout','match_run','quote_create','quote_update','quote_delete','settings_change']);
    expect(isActivityAction('quote_create')).toBe(true);
    expect(isActivityAction('drop_table')).toBe(false);
  });
});
