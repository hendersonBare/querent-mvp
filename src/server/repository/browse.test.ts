import {describe,expect,it} from 'vitest';
import {browse} from './browse';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

describe('data browser',()=>{
  it('browses the catalog with stock by branch',()=>{
    const page=browse(null,'items_stock',1,10);
    expect(page).toMatchObject({total:62,page:1,size:10});
    expect(page.rows).toHaveLength(10);
    expect(page.rows[0]).toMatchObject({sku:'ANC-12-414-W',category:'Fasteners',available:'SLC 30 · Ogden 12 · Provo 9'});
    expect(browse(null,'items_stock',7,10).rows).toHaveLength(2);
  });

  it('browses customer records, empty for placeholder customers',()=>{
    expect(browse('wasatch','orders_quotes',1,5).total).toBe(23);
    expect(browse('wasatch','orders_quotes',1,5).rows[0]).toMatchObject({order_number:'SO-51223',status:'shipped'});
    expect(browse('great-basin','orders_quotes',1,5).total).toBe(0);
    expect(browse('wasatch','pricing',1,5).total).toBe(62);
    expect(browse('great-basin','pricing',1,5).total).toBe(0);
    expect(browse(null,'account',1,10).total).toBe(4);
    expect(browse('wasatch','account',1,10).rows[0]).toMatchObject({account_number:'WAS-1142',rep:'Brandi Gallegos'});
  });

  it('never shows cost',()=>{
    for(const category of ['items_stock','pricing','orders_quotes','account'] as const)
      for(const row of browse(null,category,1,100).rows)expect(Object.keys(row).some(k=>/cost/i.test(k))).toBe(false);
  });
});
