// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {buildFixturePdf,SAMPLE_LIST_LINES,SAMPLE_LIST_PDF_PATH} from './fixture-pdf';
import {PDF_FIXTURES} from './fixtures/pdf';
import {createScriptedParser,sha256Hex} from './scripted-parser';

const latin1=(data:Uint8Array)=>Buffer.from(data).toString('latin1');

describe('buildFixturePdf',()=>{
  it('writes a well-formed PDF: header, objects at the offsets the xref table names, trailer, EOF',()=>{
    const pdf=latin1(buildFixturePdf(['Hello (world)','Second \\ line']));
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref=Number(pdf.match(/startxref\n(\d+)\n/)![1]);
    expect(pdf.slice(startxref,startxref+4)).toBe('xref');
    const offsets=[...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m=>Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset,i)=>expect(pdf.slice(offset,offset+`${i+1} 0 obj`.length)).toBe(`${i+1} 0 obj`));
    expect(pdf).toContain('(Hello \\(world\\)) Tj');
    expect(pdf).toContain('(Second \\\\ line) Tj');
    const length=Number(pdf.match(/<< \/Length (\d+) >>\nstream\n/)![1]);
    const start=pdf.indexOf('stream\n')+'stream\n'.length;
    expect(pdf.slice(start+length,start+length+'\nendstream'.length)).toBe('\nendstream');
  });

  it('is deterministic',()=>{
    expect(sha256Hex(buildFixturePdf(SAMPLE_LIST_LINES))).toBe(sha256Hex(buildFixturePdf(SAMPLE_LIST_LINES)));
  });
});

describe('the committed sample list PDF',()=>{
  const committed=new Uint8Array(readFileSync(join(process.cwd(),SAMPLE_LIST_PDF_PATH)));

  it('is exactly what buildFixturePdf(SAMPLE_LIST_LINES) writes',()=>{
    expect(sha256Hex(committed)).toBe(sha256Hex(buildFixturePdf(SAMPLE_LIST_LINES)));
  });

  it('has a parse fixture, which the scripted parser returns',async()=>{
    expect(PDF_FIXTURES[sha256Hex(committed)]).toBeDefined();
    const result=await createScriptedParser().parse({kind:'pdf',data:committed,filename:'sample-list.pdf'});
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    // One row per product line: the header, address and total lines are not rows.
    expect(result.rows.length).toBe(SAMPLE_LIST_LINES.filter(l=>/^(S|H)-\d/.test(l)).length);
    for(const row of result.rows)expect(SAMPLE_LIST_LINES).toContain(row.rawText);
  });
});
