import {readFileSync} from 'node:fs';
import path from 'node:path';
import {crc32} from 'node:zlib';
import {deflateSync} from 'node:zlib';

// Pictures built from the 2x2 fixtures beside this file, for the rep picture tests (plan U9; C_RS2): pictures that
// carry text and metadata (which storing strips), a high-entropy PNG whose image data happens to hold markup-like
// bytes (which must not be refused), and a JPEG with an ICC profile (which storing keeps). Shared by the unit
// tests (src/server/picture-format.test.ts) and the e2e (e2e/rep-settings.spec.ts).

export const fixture=(name:string)=>new Uint8Array(readFileSync(path.join(__dirname,name)));
export const FIXTURES=['tiny.png','tiny.jpg','tiny-progressive.jpg','tiny-lossy.webp','tiny-lossless.webp','tiny-alpha.webp'] as const;

/** Markup a polyglot would hide in a picture's text: an event handler, which no tag denylist catches. */
export const PAYLOAD='<img src=x onerror=alert(1)>';

const enc=(s:string)=>new TextEncoder().encode(s);
export const concat=(...parts:(Uint8Array|number[]|string)[])=>{
  const chunks=parts.map(p=>typeof p==='string'?enc(p):p instanceof Uint8Array?p:Uint8Array.from(p));
  const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;
  for(const c of chunks){out.set(c,at);at+=c.length;}
  return out;
};
const u32be=(n:number)=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255];
const u32le=(n:number)=>[n&255,n>>>8&255,n>>>16&255,n>>>24&255];
const u16be=(n:number)=>[n>>>8&255,n&255];

/** Whether `needle` occurs in `bytes`. */
export function contains(bytes:Uint8Array,needle:string|Uint8Array):boolean{
  const n=typeof needle==='string'?enc(needle):needle;
  outer:for(let i=bytes.indexOf(n[0]);i!==-1&&i+n.length<=bytes.length;i=bytes.indexOf(n[0],i+1)){
    for(let k=1;k<n.length;k++)if(bytes[i+k]!==n[k])continue outer;
    return true;
  }
  return false;
}

/** A PNG chunk with its length and a correct CRC. */
export function pngChunk(type:string,data:Uint8Array|string):Uint8Array{
  const body=concat(type,data);
  return concat(u32be(body.length-4),body,u32be(crc32(body)>>>0));
}

/** The four-letter types of a PNG's chunks, in order. */
export function pngChunkTypes(png:Uint8Array):string[]{
  const view=new DataView(png.buffer,png.byteOffset,png.byteLength),types:string[]=[];
  for(let at=8;at+12<=png.length;at+=12+view.getUint32(at))types.push(String.fromCharCode(...png.subarray(at+4,at+8)));
  return types;
}

/**
 * tiny.png with colour chunks (sRGB, gAMA, pHYs) that storing keeps, and text and metadata chunks (tEXt, iTXt,
 * zTXt, eXIf, tIME and a private one) carrying `payload`, which storing drops.
 */
export function pngWithText(payload=PAYLOAD):Uint8Array{
  const png=fixture('tiny.png'),ihdrEnd=8+25,iendAt=png.length-12;
  return concat(png.subarray(0,ihdrEnd),
    pngChunk('sRGB',Uint8Array.from([0])),pngChunk('gAMA',Uint8Array.from(u32be(45455))),
    pngChunk('tEXt',concat('Comment\0',payload)),
    pngChunk('iTXt',concat('XML:com.adobe.xmp\0\0\0\0\0',`<x:xmpmeta>${payload}</x:xmpmeta>`)),
    pngChunk('pHYs',Uint8Array.from([...u32be(2835),...u32be(2835),1])),
    png.subarray(ihdrEnd,iendAt),
    pngChunk('zTXt',concat('Comment\0\0',deflateSync(enc(payload)))),
    pngChunk('eXIf',concat('MM\0*',u32be(8),payload)),
    pngChunk('tIME',Uint8Array.from([0x07,0xea,10,12,9,0,0])),
    pngChunk('prVt',payload),
    png.subarray(iendAt));
}

/**
 * A 64x64 RGB PNG of random pixels, stored uncompressed (zlib level 0) so the image data holds, as pixels,
 * `<svg`, `<SCRIPT` and `<script>` bytes: an ordinary picture that a scan for markup over the whole file refuses.
 */
export function noisyPng():Uint8Array{
  const width=64,height=64,row=1+width*3,raw=new Uint8Array(row*height);
  let seed=0x9e3779b9;
  for(let i=0;i<raw.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;raw[i]=seed&255;}
  for(let y=0;y<height;y++)raw[y*row]=0;                    // filter: none
  raw.set(enc('<svg'),1+row*3);raw.set(enc('<SCRIPT'),1+row*20);raw.set(enc('<script>'),1+row*40);
  const ihdr=Uint8Array.from([...u32be(width),...u32be(height),8,2,0,0,0]);
  return concat([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(raw,{level:0})),pngChunk('IEND',new Uint8Array()));
}

const jpegSegment=(marker:number,data:Uint8Array|string)=>{const body=typeof data==='string'?enc(data):data;return concat([0xff,marker],u16be(body.length+2),body);};
/** A small ICC profile body: its header names the 'mntr' class and 'RGB ' space; the bytes only need to survive. */
export const ICC=concat(u32be(132),'none',[2,0x10,0,0],'mntr','RGB ','XYZ ',new Uint8Array(12),'acsp',new Uint8Array(84),u32be(0));
export const ICC_SEGMENT=jpegSegment(0xe2,concat('ICC_PROFILE\0',[1,1],ICC));

/** tiny.jpg (JFIF) with a COM segment, an APP1 XMP packet and an APP1 Exif block, each carrying `payload`. */
export function jpegWithText(payload=PAYLOAD,name='tiny.jpg'):Uint8Array{
  const jpeg=fixture(name),app0End=2+2+((jpeg[4]<<8)|jpeg[5]);
  return concat(jpeg.subarray(0,app0End),
    jpegSegment(0xe1,concat('Exif\0\0MM\0*',u32be(8),payload)),
    jpegSegment(0xe1,`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/">${payload}</x:xmpmeta>`),
    jpegSegment(0xfe,payload),
    jpegSegment(0xed,concat('Photoshop 3.0\0',payload)),
    jpeg.subarray(app0End));
}

/** tiny.jpg with an APP2 ICC profile after its JFIF header (and an APP14 Adobe segment), which storing keeps. */
export function jpegWithIcc():Uint8Array{
  const jpeg=fixture('tiny.jpg'),app0End=2+2+((jpeg[4]<<8)|jpeg[5]);
  return concat(jpeg.subarray(0,app0End),ICC_SEGMENT,jpegSegment(0xee,concat('Adobe',[0,100,0,0,0,0,1])),jpeg.subarray(app0End));
}

/** The fourccs of a WebP's chunks, in order. */
export function webpChunks(webp:Uint8Array):string[]{
  const view=new DataView(webp.buffer,webp.byteOffset,webp.byteLength),out:string[]=[];
  for(let at=12;at+8<=webp.length;){const size=view.getUint32(at+4,true);out.push(String.fromCharCode(...webp.subarray(at,at+4)));at+=8+size+(size&1);}
  return out;
}
const webpChunk=(fourcc:string,data:Uint8Array|string)=>{const body=typeof data==='string'?enc(data):data;return concat(fourcc,u32le(body.length),body,body.length&1?[0]:[]);};

/** tiny-alpha.webp (VP8X) with an EXIF and an XMP chunk carrying `payload`, flagged in its VP8X header. */
export function webpWithText(payload=PAYLOAD):Uint8Array{
  const webp=fixture('tiny-alpha.webp');
  const out=concat(webp,webpChunk('EXIF',concat('MM\0*',u32be(8),payload)),webpChunk('XMP ',`<x:xmpmeta>${payload}</x:xmpmeta>`));
  out[20]|=0x08|0x04;                                         // VP8X flags: EXIF, XMP
  out.set(u32le(out.length-8),4);
  return out;
}
