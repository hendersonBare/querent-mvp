import {describe,expect,it} from 'vitest';
import {CSV_BOM,csvCell,csvDocument,guardFormula} from './csv';

// CSV writing for the rep's exports (task 4.3): RFC 4180 quoting, a guard against formula
// injection, and a UTF-8 BOM with CRLF rows so Excel and Google Sheets read it as intended.

describe('csvCell (RFC 4180)',()=>{
  it('leaves plain text and numbers bare',()=>{
    expect(csvCell('HCS-12-13-2G8')).toBe('HCS-12-13-2G8');
    expect(csvCell('Box of 50')).toBe('Box of 50');
    expect(csvCell(10)).toBe('10');
    expect(csvCell('315.00')).toBe('315.00');
  });

  it('writes null and undefined as an empty field',()=>{
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('')).toBe('');
  });

  it('quotes a field with a comma, a quote, a line break or edge spaces, doubling its quotes',()=>{
    expect(csvCell('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc')).toBe('"Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc"');
    expect(csvCell('Pipe 3/4" black')).toBe('"Pipe 3/4"" black"');
    expect(csvCell('"quoted"')).toBe('"""quoted"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('two\r\nlines')).toBe('"two\r\nlines"');
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  it('writes a number as its digits, even a negative one: a number is never a formula',()=>{
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(0.0825)).toBe('0.0825');
    expect(csvCell(Number.NaN)).toBe('');
  });
});

describe('guardFormula (CSV injection)',()=>{
  it.each(['=1+1','+1 801 555 0120','-2+3','@SUM(A1:A2)','\t=1+1','\r=1+1'])('prefixes %j with an apostrophe so it stays text',text=>{
    expect(guardFormula(text)).toBe(`'${text}`);
  });

  it('catches a trigger after leading spaces and the full-width forms some spreadsheets accept',()=>{
    expect(guardFormula('  =HYPERLINK("http://x","y")')).toBe(`'  =HYPERLINK("http://x","y")`);
    expect(guardFormula('＝1+1')).toBe('\'＝1+1');
    expect(guardFormula('＠SUM(A1)')).toBe('\'＠SUM(A1)');
  });

  it('leaves everything else alone, including triggers after the first character',()=>{
    for(const text of ['HCS-12-13-2G8','1/2-13 x 2 in','a=b','Tape, 2 in','$31.50',''])expect(guardFormula(text)).toBe(text);
  });

  it('is applied before quoting, so a guarded formula with commas and quotes is still one field',()=>{
    expect(csvCell('=HYPERLINK("http://evil.example","Click")')).toBe('"\'=HYPERLINK(""http://evil.example"",""Click"")"');
    expect(csvCell('-cmd|\' /C calc\'!A0')).toBe('\'-cmd|\' /C calc\'!A0');
    expect(csvCell('@x,y')).toBe('"\'@x,y"');
  });
});

describe('csvDocument',()=>{
  it('starts with a UTF-8 BOM and ends every row with CRLF',()=>{
    const text=csvDocument([['SKU','Description'],['GLV-N8-L-1000','Nitrile gloves, size L'],[]]);
    expect(CSV_BOM).toBe('﻿');
    expect(text).toBe('﻿SKU,Description\r\nGLV-N8-L-1000,"Nitrile gloves, size L"\r\n\r\n');
  });

  it('keeps a line break inside a quoted field, so a spreadsheet reads one row',()=>{
    expect(csvDocument([['a\nb','c']])).toBe('﻿"a\nb",c\r\n');
  });

  it('encodes as UTF-8 bytes EF BB BF first',()=>{
    const bytes=new TextEncoder().encode(csvDocument([['½-13 × 2']]));
    expect([...bytes.slice(0,3)]).toEqual([0xef,0xbb,0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('½-13 × 2\r\n');
  });
});
