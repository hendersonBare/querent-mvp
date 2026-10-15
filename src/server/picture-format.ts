import type {PictureType} from '@/domain';

// A rep's picture (plan U9; C_RS2) is checked by its whole structure, never by the type an upload claims or by its
// first bytes alone, so a file that merely starts like a picture is refused:
//   PNG   the signature, then chunk by chunk (each length inside the file, each type four letters) from IHDR
//         first, through at least one IDAT, to IEND as the very last bytes;
//   JPEG  SOI, then marker segment by marker segment (each length inside the file, the entropy-coded data after
//         each SOS skipped to the next marker), a frame (SOF) before the first scan, and EOI as the very last bytes;
//   WebP  RIFF whose size field is the file's length minus 8, WEBP, then chunk by chunk to the end: a VP8 or VP8L
//         bitstream alone, or VP8X followed by chunks among which a VP8, VP8L or animation frame.
// CRCs are not checked: the structure is what decides whether the bytes can be read as something else.
//
// What is stored and served (storablePicture) is the picture without its text and metadata, rebuilt from the
// segments kept, in their order, and checked by its structure again:
//   PNG   only IHDR, PLTE, IDAT, IEND and the colour chunks tRNS, gAMA, cHRM, sRGB, iCCP, sBIT and pHYs, each
//         copied whole with its CRC; tEXt, iTXt, zTXt, eXIf, tIME and every other ancillary chunk are dropped;
//   JPEG  COM and every APPn segment are dropped except APP0 JFIF, APP2 ICC_PROFILE and APP14 Adobe (its colour
//         transform); every other segment and the entropy-coded data are kept, through EOI;
//   WebP  only VP8X, ICCP, ANIM, ANMF, ALPH, VP8 and VP8L chunks: EXIF, XMP and unknown chunks are dropped, the
//         VP8X EXIF and XMP flags cleared, and the RIFF size set to the new length.
// Nothing is refused for what its image data holds: compressed pixels are close to random, so any byte pattern
// turns up in ordinary pictures. Serving the stored type with nosniff and a sandbox (./picture-response) is
// what keeps a browser from reading the image data as anything else.

const ascii=(bytes:Uint8Array,at:number,length:number)=>String.fromCharCode(...bytes.subarray(at,at+length));
const isLetter=(b:number)=>(b>=0x41&&b<=0x5a)||(b>=0x61&&b<=0x7a);

const PNG_SIGNATURE=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];

function isPng(bytes:Uint8Array):boolean{
  if(bytes.length<8||!PNG_SIGNATURE.every((b,i)=>bytes[i]===b))return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let at=8,first=true,sawData=false;
  while(at+12<=bytes.length){
    const length=view.getUint32(at);
    if(length>0x7fffffff||at+12+length>bytes.length)return false;
    if(!bytes.subarray(at+4,at+8).every(isLetter))return false;
    const type=ascii(bytes,at+4,4);
    if(first){
      // IHDR: 13 bytes, width and height above zero.
      if(type!=='IHDR'||length!==13||view.getUint32(at+8)===0||view.getUint32(at+12)===0)return false;
      first=false;
    }else if(type==='IHDR')return false;
    if(type==='IDAT')sawData=true;
    at+=12+length;
    if(type==='IEND')return length===0&&sawData&&at===bytes.length;
  }
  return false;
}

/** Start-of-frame markers: C0 to CF, less DHT (C4), JPG (C8) and DAC (CC). */
const isFrame=(m:number)=>m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc;
const isRestart=(m:number)=>m>=0xd0&&m<=0xd7;

function isJpeg(bytes:Uint8Array):boolean{
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return false;
  let at=2,sawFrame=false,sawScan=false;
  while(at<bytes.length){
    if(bytes[at]!==0xff)return false;
    while(at<bytes.length&&bytes[at]===0xff)at++;          // fill bytes before a marker
    if(at>=bytes.length)return false;
    const marker=bytes[at++];
    if(marker===0xd9)return sawFrame&&sawScan&&at===bytes.length;
    if(marker===0x01||isRestart(marker))continue;           // standalone markers: no length
    if(marker<0xc0||marker===0xd8)return false;             // reserved, or a second SOI
    if(at+2>bytes.length)return false;
    const length=(bytes[at]<<8)|bytes[at+1];
    if(length<2||at+length>bytes.length)return false;
    if(isFrame(marker)){if(length<8)return false;sawFrame=true;}
    at+=length;
    if(marker===0xda){
      if(!sawFrame)return false;
      sawScan=true;
      // Entropy-coded data: runs to the next marker that is not a stuffed 0x00, a restart or fill.
      for(;;){
        const next=bytes.indexOf(0xff,at);
        if(next===-1||next+1>=bytes.length)return false;
        const b=bytes[next+1];
        if(b===0x00||isRestart(b)){at=next+2;continue;}
        if(b===0xff){at=next+1;continue;}
        at=next;break;
      }
    }
  }
  return false;
}

function isWebp(bytes:Uint8Array):boolean{
  if(bytes.length<20||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WEBP')return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(4,true)!==bytes.length-8)return false;
  let at=12,first:string|null=null,sawImage=false;
  while(at<bytes.length){
    if(at+8>bytes.length)return false;
    if(!bytes.subarray(at,at+4).every(b=>isLetter(b)||(b>=0x30&&b<=0x39)||b===0x20))return false;
    const fourcc=ascii(bytes,at,4),size=view.getUint32(at+4,true),data=at+8;
    if(data+size>bytes.length)return false;
    if(first===null){
      first=fourcc;
      if(fourcc!=='VP8 '&&fourcc!=='VP8L'&&fourcc!=='VP8X')return false;
      if(fourcc==='VP8X'&&size!==10)return false;
    }else if(first!=='VP8X')return false;                   // a simple WebP is its one bitstream chunk
    if(fourcc==='VP8 '){
      // A key frame: the 3-byte frame tag, then the start code 9D 01 2A.
      if(size<10||bytes[data+3]!==0x9d||bytes[data+4]!==0x01||bytes[data+5]!==0x2a)return false;
      sawImage=true;
    }else if(fourcc==='VP8L'){
      if(size<5||bytes[data]!==0x2f)return false;
      sawImage=true;
    }else if(fourcc==='ANMF')sawImage=true;
    at=data+size+(size&1);                                  // chunks are padded to an even length
  }
  return at===bytes.length&&sawImage;
}

const concat=(parts:Uint8Array[])=>{
  const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;
  for(const p of parts){out.set(p,at);at+=p.length;}
  return out;
};
const startsWith=(bytes:Uint8Array,at:number,text:string)=>at+text.length<=bytes.length&&ascii(bytes,at,text.length)===text;

const PNG_KEPT=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','gAMA','cHRM','sRGB','iCCP','sBIT','pHYs']);

/** A well formed PNG (isPng) with only its critical and colour chunks. */
function stripPng(bytes:Uint8Array):Uint8Array{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[bytes.subarray(0,8)];
  for(let at=8;at<bytes.length;){
    const end=at+12+view.getUint32(at);
    if(PNG_KEPT.has(ascii(bytes,at+4,4)))parts.push(bytes.subarray(at,end));
    at=end;
  }
  return concat(parts);
}

/** Whether a JPEG APPn segment (its marker, and its payload from `at` for `length` bytes) is colour data kept. */
function keptApp(bytes:Uint8Array,marker:number,at:number,length:number):boolean{
  if(marker===0xe0)return startsWith(bytes,at,'JFIF\0');
  if(marker===0xe2)return startsWith(bytes,at,'ICC_PROFILE\0');
  if(marker===0xee)return length===12&&startsWith(bytes,at,'Adobe');
  return false;
}

/** A well formed JPEG (isJpeg) without COM, and with no APPn but JFIF, ICC_PROFILE and Adobe. Fill bytes go. */
function stripJpeg(bytes:Uint8Array):Uint8Array{
  const parts=[bytes.subarray(0,2)];
  let at=2;
  for(;;){
    while(bytes[at]===0xff)at++;
    const marker=bytes[at++];
    if(marker===0xd9){parts.push(Uint8Array.from([0xff,0xd9]));return concat(parts);}
    if(marker===0x01||isRestart(marker)){parts.push(Uint8Array.from([0xff,marker]));continue;}
    const length=(bytes[at]<<8)|bytes[at+1],end=at+length;
    const dropped=marker===0xfe||(marker>=0xe0&&marker<=0xef&&!keptApp(bytes,marker,at+2,length-2));
    if(!dropped)parts.push(bytes.subarray(at-2,end));
    at=end;
    if(marker===0xda){
      const data=at;
      for(;;){
        const next=bytes.indexOf(0xff,at),b=bytes[next+1];
        if(b===0x00||isRestart(b)){at=next+2;continue;}
        if(b===0xff){at=next+1;continue;}
        at=next;break;
      }
      parts.push(bytes.subarray(data,at));
    }
  }
}

const WEBP_KEPT=new Set(['VP8X','ICCP','ANIM','ANMF','ALPH','VP8 ','VP8L']);

/** A well formed WebP (isWebp) with only its image and colour chunks, its VP8X flags and RIFF size to match. */
function stripWebp(bytes:Uint8Array):Uint8Array{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts:Uint8Array[]=[bytes.slice(0,12)];
  for(let at=12;at<bytes.length;){
    const size=view.getUint32(at+4,true),end=at+8+size+(size&1),fourcc=ascii(bytes,at,4);
    if(fourcc==='VP8X'){
      const header=bytes.slice(at,end);
      header[8]&=~(0x08|0x04);                              // flags: EXIF, XMP
      parts.push(header);
    }else if(WEBP_KEPT.has(fourcc))parts.push(bytes.subarray(at,end));
    at=end;
  }
  const out=concat(parts);
  new DataView(out.buffer).setUint32(4,out.length-8,true);
  return out;
}

/** PNG, JPEG or WebP when the bytes are a whole, well formed picture of that type; else null. */
export function pictureType(bytes:Uint8Array):PictureType|null{
  return isPng(bytes)?'image/png':isJpeg(bytes)?'image/jpeg':isWebp(bytes)?'image/webp':null;
}

/**
 * What to store for an uploaded picture: its type and its bytes without text and metadata (see the top of this
 * file), or null when the bytes are not a whole, well formed PNG, JPEG or WebP, before or after stripping.
 */
export function storablePicture(bytes:Uint8Array):{type:PictureType;data:Uint8Array}|null{
  const type=pictureType(bytes);
  if(!type)return null;
  const data=type==='image/png'?stripPng(bytes):type==='image/jpeg'?stripJpeg(bytes):stripWebp(bytes);
  return pictureType(data)===type?{type,data}:null;
}
