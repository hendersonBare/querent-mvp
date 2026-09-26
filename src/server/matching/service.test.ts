import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '../repository/test-db';

useSeededDatabase();
const service=()=>import('./service');

describe('catalogMatches',()=>{
  it('returns scored customer-safe candidates in descending order',async()=>{
    const {catalogMatches}=await service();
    const candidates=catalogMatches('wasatch','4.5 x .045 cut-off wheels');
    expect(candidates.slice(0,2)).toEqual([
      {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',category_name:'Abrasives & Cutting',score:.82},
      {sku:'CW-45-045-T27',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 27',pack:'Box of 25',category_name:'Abrasives & Cutting',score:.82},
    ]);
  });

  it('loads customer history only when the request says "usual"',async()=>{
    const {catalogMatches}=await service();
    expect(catalogMatches('wasatch','the usual cut-off wheels')[0]).toMatchObject({sku:'CW-45-045-T1',score:1});
    expect(catalogMatches('great-basin','the usual cut-off wheels').slice(0,2).map(c=>c.score)).toEqual([.82,.82]);
  });

  it('normalizes the limit to 1..50',async()=>{
    const {catalogMatches}=await service();
    expect(catalogMatches('wasatch','tape',{limit:2})).toHaveLength(2);
    expect(catalogMatches('wasatch','tape',{limit:0})).toHaveLength(1);
    expect(catalogMatches('wasatch','in',{limit:500}).length).toBeLessThanOrEqual(50);
    expect(catalogMatches('wasatch','in',{limit:Number.NaN})).toHaveLength(10);
  });
});
