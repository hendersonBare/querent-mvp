// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {MAX_ROWS,TOO_MANY_ROWS_ERROR} from './rows';
import {createScriptedParser,parseLine,PDF_FIXTURE_MISSING_ERROR,sha256Hex} from './scripted-parser';
import type {ParsedRow} from './types';

const expectRow=(line:string,want:Partial<ParsedRow>)=>expect(parseLine(line)).toEqual({
  rawText:line.trim(),description:'',quantity:null,unit:null,suppliersSku:null,quantityUnclear:true,
  ...want,...(want.quantity!=null&&want.quantityUnclear===undefined?{quantityUnclear:false}:{}),
});

describe('scripted parser: one line',()=>{
  it.each<[string,Partial<ParsedRow>]>([
    ['S-4128 12 x 10 x 8" Corrugated Boxes 10 bundles',{description:'12 x 10 x 8" Corrugated Boxes',quantity:10,unit:'bundle',suppliersSku:'S-4128'}],
    ['12x10x8 corrugated boxes, qty 10',{description:'12x10x8 corrugated boxes',quantity:10}],
    ['12x10x8 corrugated boxes Qty: 7',{description:'12x10x8 corrugated boxes',quantity:7}],
    ['Bubble wrap roll x 10',{description:'Bubble wrap roll',quantity:10}],
    ['10 cs packing tape 2" x 110 yd',{description:'packing tape 2" x 110 yd',quantity:10,unit:'case'}],
    ['10 cases 12x10x8 boxes',{description:'12x10x8 boxes',quantity:10,unit:'case'}],
    ['12x10x8 boxes 10 cs',{description:'12x10x8 boxes',quantity:10,unit:'case'}],
    ['10 12x10x8 boxes',{description:'12x10x8 boxes',quantity:10}],
    ['10 x 12x10x8 boxes',{description:'12x10x8 boxes',quantity:10}],
    ['5\t12x10x8 boxes',{description:'12x10x8 boxes',quantity:5}],
    ['12x10x8 boxes\t5',{description:'12x10x8 boxes',quantity:5}],
    ['- 4 rolls stretch wrap',{description:'stretch wrap',quantity:4,unit:'roll'}],
    ['3 each tape dispenser',{description:'tape dispenser',quantity:3,unit:'each'}],
    ['Poly bags 2 mil 12x15 500/case, 2 cases',{description:'Poly bags 2 mil 12x15 500/case',quantity:2,unit:'case'}],
    ['18" x 1500\' stretch film x 4',{description:'18" x 1500\' stretch film',quantity:4}],
    ['12x10x8 corrugated boxes H-123',{description:'12x10x8 corrugated boxes',suppliersSku:'H-123'}],
    ['S-4128 - 12x10x8 corrugated boxes - 25',{description:'12x10x8 corrugated boxes',quantity:25,suppliersSku:'S-4128'}],
  ])('reads %j',(line,want)=>expectRow(line,want));

  it.each<[string,string]>([
    ['12x10x8 corrugated boxes','12x10x8 corrugated boxes'],
    ['Stretch film 18" x 1500\' 80 gauge','Stretch film 18" x 1500\' 80 gauge'],
    ['3 inch kraft tape','3 inch kraft tape'],
    ['2" packing tape','2" packing tape'],
    ['0 boxes','boxes'],
  ])('leaves the quantity unclear in %j',(line,description)=>expectRow(line,{description}));

  it('keeps the whole line as rawText, list markers included',()=>{
    expect(parseLine('  1. 12x10x8 boxes qty 3  ')).toMatchObject({rawText:'1. 12x10x8 boxes qty 3',description:'12x10x8 boxes',quantity:3});
  });

  it('uses the raw text as description when nothing else is left',()=>{
    expect(parseLine('10')).toMatchObject({rawText:'10',description:'10'});
  });

  it('skips blank lines',()=>{expect(parseLine('   ')).toBeNull();});
});

describe('scripted parser: lists',()=>{
  it('makes one row per non-empty line, in order',async()=>{
    const result=await createScriptedParser().parse({kind:'text',text:'12x10x8 boxes qty 10\r\n\r\n  \nBubble wrap x 2\n'});
    expect(result.ok&&result.rows.map(r=>r.rawText)).toEqual(['12x10x8 boxes qty 10','Bubble wrap x 2']);
  });

  it(`refuses more than ${MAX_ROWS} lines`,async()=>{
    const text=(n:number)=>Array.from({length:n},(_,i)=>`item ${i} qty 1`).join('\n');
    const ok=await createScriptedParser().parse({kind:'text',text:text(MAX_ROWS)});
    expect(ok.ok&&ok.rows).toHaveLength(MAX_ROWS);
    expect(await createScriptedParser().parse({kind:'text',text:text(MAX_ROWS+1)})).toEqual({ok:false,error:TOO_MANY_ROWS_ERROR});
  });

  it('reads a PDF from its fixture by sha256, and refuses an unknown PDF',async()=>{
    const data=new TextEncoder().encode('%PDF-1.4 fake');
    const rows:ParsedRow[]=[{rawText:'a',description:'a',quantity:1,unit:null,suppliersSku:null,quantityUnclear:false}];
    const parser=createScriptedParser({pdfFixtures:{[sha256Hex(data)]:rows}});
    expect(await parser.parse({kind:'pdf',data})).toEqual({ok:true,rows});
    expect(await parser.parse({kind:'pdf',data:new TextEncoder().encode('%PDF-1.4 other')})).toEqual({ok:false,error:PDF_FIXTURE_MISSING_ERROR});
  });

  it('validates PDF fixtures like live output',async()=>{
    const data=new TextEncoder().encode('%PDF-1.4 bad');
    const parser=createScriptedParser({pdfFixtures:{[sha256Hex(data)]:[{rawText:'a'}] as unknown as ParsedRow[]}});
    expect((await parser.parse({kind:'pdf',data})).ok).toBe(false);
  });
});
