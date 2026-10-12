import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {pictureType} from './picture-format';

// A rep's picture (plan U9; C_RS2) is checked by its whole structure, never by the type an upload claims or by its
// first bytes alone: a PNG walked chunk by chunk from IHDR to IEND, a JPEG segment by segment from SOI to EOI,
// a WebP by its RIFF size and its chunks. A file that merely starts like a picture (a polyglot carrying HTML or
// SVG, a truncated file, or data after the image's end) is not a picture.

const fixture=(name:string)=>new Uint8Array(readFileSync(path.join(__dirname,'../../test/fixtures/pictures',name)));
const bytes=(...parts:(Uint8Array|number[]|string)[])=>{
  const chunks=parts.map(p=>typeof p==='string'?new TextEncoder().encode(p):p instanceof Uint8Array?p:Uint8Array.from(p));
  const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;
  for(const c of chunks){out.set(c,at);at+=c.length;}
  return out;
};
const u32be=(n:number)=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255];
const u32le=(n:number)=>[n&255,n>>>8&255,n>>>16&255,n>>>24&255];

const PNG=fixture('tiny.png'),JPEG=fixture('tiny.jpg'),PROGRESSIVE=fixture('tiny-progressive.jpg');
const LOSSY=fixture('tiny-lossy.webp'),LOSSLESS=fixture('tiny-lossless.webp'),ALPHA=fixture('tiny-alpha.webp');
const HTML='<html><body><script>alert(document.cookie)</script></body></html>';
const SVG='<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>';
const PNG_SIGNATURE=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
const IEND_AT=PNG.length-12;

describe('pictureType: real pictures',()=>{
  it('knows a PNG, a baseline and a progressive JPEG, and a lossy, lossless and extended (alpha) WebP',()=>{
    expect(pictureType(PNG)).toBe('image/png');
    expect(pictureType(JPEG)).toBe('image/jpeg');
    expect(pictureType(PROGRESSIVE)).toBe('image/jpeg');
    expect(pictureType(LOSSY)).toBe('image/webp');
    expect(pictureType(LOSSLESS)).toBe('image/webp');
    expect(pictureType(ALPHA)).toBe('image/webp');
  });
});

describe('pictureType: polyglots are not pictures',()=>{
  it('refuses a PNG signature followed by HTML',()=>{
    expect(pictureType(bytes(PNG_SIGNATURE,HTML))).toBeNull();
    expect(pictureType(bytes(PNG.subarray(0,33),HTML))).toBeNull();
  });
  it('refuses a JPEG start followed by HTML',()=>{
    expect(pictureType(bytes([0xff,0xd8,0xff],HTML))).toBeNull();
    expect(pictureType(bytes(JPEG.subarray(0,20),HTML))).toBeNull();
  });
  it('refuses a WebP header followed by SVG, even with a RIFF size that matches',()=>{
    const svg=new TextEncoder().encode(SVG);
    expect(pictureType(bytes('RIFF',u32le(4+svg.length),'WEBP',svg))).toBeNull();
    expect(pictureType(bytes('RIFF',u32le(4+8+svg.length),'WEBP','VP8 ',u32le(svg.length),svg))).toBeNull();
  });
  it('refuses markup hidden inside an otherwise well formed picture (a PNG text chunk, a JPEG comment)',()=>{
    const text=new TextEncoder().encode(`Comment\0${HTML}`);
    const tEXt=bytes(u32be(text.length),'tEXt',text,[0,0,0,0]);
    expect(pictureType(bytes(PNG.subarray(0,IEND_AT),tEXt,PNG.subarray(IEND_AT)))).toBeNull();
    const comment=new TextEncoder().encode(SVG);
    expect(pictureType(bytes(JPEG.subarray(0,2),[0xff,0xfe,(comment.length+2)>>8,(comment.length+2)&255],comment,JPEG.subarray(2)))).toBeNull();
  });
});

describe('pictureType: truncated files are not pictures',()=>{
  it('refuses a bare PNG signature, a 20-byte PNG and a PNG cut before IEND',()=>{
    expect(pictureType(Uint8Array.from(PNG_SIGNATURE))).toBeNull();
    expect(pictureType(PNG.subarray(0,20))).toBeNull();
    expect(pictureType(PNG.subarray(0,IEND_AT))).toBeNull();
    expect(pictureType(PNG.subarray(0,PNG.length-1))).toBeNull();
  });
  it('refuses a JPEG with no EOI, or cut inside a segment',()=>{
    expect(pictureType(JPEG.subarray(0,JPEG.length-2))).toBeNull();
    expect(pictureType(JPEG.subarray(0,30))).toBeNull();
    expect(pictureType(Uint8Array.from([0xff,0xd8,0xff,0xd9]))).toBeNull();
  });
  it('refuses a WebP cut short, and one whose RIFF size is not its length',()=>{
    expect(pictureType(LOSSY.subarray(0,LOSSY.length-4))).toBeNull();
    expect(pictureType(LOSSY.subarray(0,16))).toBeNull();
    const wrongSize=LOSSY.slice();wrongSize.set(u32le(LOSSY.length),4);
    expect(pictureType(wrongSize)).toBeNull();
  });
});

describe('pictureType: data after the end of the image',()=>{
  it('refuses anything after IEND, after EOI, or after the last WebP chunk',()=>{
    expect(pictureType(bytes(PNG,HTML))).toBeNull();
    expect(pictureType(bytes(PNG,[0]))).toBeNull();
    expect(pictureType(bytes(JPEG,HTML))).toBeNull();
    expect(pictureType(bytes(JPEG,[0]))).toBeNull();
    expect(pictureType(bytes(LOSSY,SVG))).toBeNull();
    const padded=bytes(LOSSY,SVG);padded.set(u32le(padded.length-8),4);
    expect(pictureType(padded)).toBeNull();
  });
  it('refuses a PNG whose first chunk is not IHDR, or with no image data',()=>{
    const ihdrEnd=8+25;
    expect(pictureType(bytes(PNG_SIGNATURE,PNG.subarray(IEND_AT)))).toBeNull();
    expect(pictureType(bytes(PNG.subarray(0,ihdrEnd),PNG.subarray(IEND_AT)))).toBeNull();
  });
});

describe('pictureType: other formats',()=>{
  it('refuses GIF, SVG, HTML, an empty file and random bytes',()=>{
    for(const other of [bytes('GIF89a',[1,0,1,0,0,0,0]),bytes(SVG),bytes(HTML),new Uint8Array(),Uint8Array.from([0x89,0x50])])expect(pictureType(other)).toBeNull();
  });
});
