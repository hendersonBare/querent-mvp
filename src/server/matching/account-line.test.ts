// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {accountLine,scorePackaging,type PackagingItem} from '.';

// accountLine (B10b): Strict's total accounting of a line against ONE chosen item (an auto match,
// Swap or "Use this item"), the same eligibility scorePackaging gives that item. The quote tool
// converts a customer's quantity only when the line is fully accounted for by the item it is put on.

const catalog=JSON.parse(readFileSync(join(__dirname,'../../../data/boxt-catalog.json'),'utf8')) as PackagingItem[];
const bySku=(sku:string)=>catalog.find(i=>i.sku===sku)!;

describe('accountLine',()=>{
  it.each([
    ['12 x 10 x 8" Corrugated Boxes, 32 ECT','12108-BDL'],
    ['Corrugated Boxes 12x10x8 32 ECT 50/bundle','12108-BDL'],
    ['Corrugated Boxes 12x10x8 32 ECT 25/bundle','12108-BDL'],
    ['Corrugated Boxes 12x10x8 32 ECT, pack size 50','12108-BDL'],
    ['Reclosable Poly Bags 4x10" 6 mil, pack size 500','PB3866'],
    ['Reclosable Poly Bags 4x10 6 mil 1000/cs','PB3866'],
    ['Cast Stretch Wrap 18" x 1500\' 80 Gauge','SF188CAST'],
    ['Thermal Mailers 8x11 100/box 10 boxes/case','INM811'],
    ['Foam peanuts 14 cu ft','12108-BDL'],
  ])('%j against %s gives the eligibility scorePackaging gives that item',(line,sku)=>{
    const scored=scorePackaging(line,catalog).find(c=>c.item.sku===sku);
    const own=accountLine(line,bySku(sku),catalog);
    if(scored)expect(own).toEqual(scored.eligibility);
    else expect(own).toEqual({strictEligible:false,blockers:['nothing in the line fits this item']});
  });

  it('is fully accounted only when the line says nothing the item does not confirm',()=>{
    expect(accountLine('12 x 10 x 8" Corrugated Boxes, 32 ECT',bySku('12108-BDL'),catalog).strictEligible).toBe(true);
    // A stated pack that differs, an unread number, pack wording: all blockers.
    expect(accountLine('Corrugated Boxes 12x10x8 32 ECT 50/bundle',bySku('12108-BDL'),catalog).strictEligible).toBe(false);
    expect(accountLine('Corrugated Boxes 12x10x8 32 ECT, pack size 50',bySku('12108-BDL'),catalog).strictEligible).toBe(false);
    expect(accountLine('Reclosable Poly Bags 4x10" 6 mil, pack size 500',bySku('PB3866'),catalog).strictEligible).toBe(false);
    expect(accountLine('Reclosable Poly Bags 4x10" 6 mil, carton of five hundred',bySku('PB3866'),catalog).strictEligible).toBe(false);
  });
});
