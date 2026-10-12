import type {PictureType} from '@/domain';

// A rep's picture (plan U9; C_RS2) is checked by its whole structure, never by the type an upload claims or by its
// first bytes alone, so a file that merely starts like a picture is refused:
//   PNG   the signature, then chunk by chunk (each length inside the file, each type four letters) from IHDR
//         first, through at least one IDAT, to IEND as the very last bytes;
//   JPEG  SOI, then marker segment by marker segment (each length inside the file, the entropy-coded data after
//         each SOS skipped to the next marker), a frame (SOF) before the first scan, and EOI as the very last bytes;
//   WebP  RIFF whose size field is the file's length minus 8, WEBP, then chunk by chunk to the end: a VP8 or VP8L
//         bitstream alone, or VP8X followed by chunks among which a VP8, VP8L or animation frame.
// On top of that, a picture carrying HTML or SVG markup anywhere (a PNG text chunk, a JPEG comment, a WebP
// metadata chunk) is refused: no real picture needs it, and it is what a polyglot hides. CRCs are not checked:
// the structure is what decides whether the bytes can be read as something else.

/** Markup a browser could run, as lowercase ASCII; matched case-insensitively. */
const MARKUP=['<script','<html','<svg','<!doctype','<body','<iframe','<object','<embed'];

function carriesMarkup(bytes:Uint8Array):boolean{
  for(let i=bytes.indexOf(0x3c);i!==-1;i=bytes.indexOf(0x3c,i+1)){
    for(const tag of MARKUP){
      if(i+tag.length>bytes.length)continue;
      let match=true;
      for(let k=1;k<tag.length&&match;k++){
        const b=bytes[i+k];
        match=(b>=0x41&&b<=0x5a?b|0x20:b)===tag.charCodeAt(k);
      }
      if(match)return true;
    }
  }
  return false;
}

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

/** PNG, JPEG or WebP when the bytes are a whole, well formed picture of that type and carry no markup; else null. */
export function pictureType(bytes:Uint8Array):PictureType|null{
  const type:PictureType|null=isPng(bytes)?'image/png':isJpeg(bytes)?'image/jpeg':isWebp(bytes)?'image/webp':null;
  return type&&!carriesMarkup(bytes)?type:null;
}
