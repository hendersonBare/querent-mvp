import {pictureResponse} from '@/server/picture-response';
import {repJson,repRoute} from '@/server/rep/http';
import {PICTURE_MAX_BYTES,PICTURE_TOO_BIG,ownPicture,removePicture,savePicture} from '@/server/rep/profile';
import {profileError} from '@/server/rep/profile-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * The signed-in rep's picture (plan U9; C_RS2 "Upload picture", "Remove"):
 *   GET     serves their own picture (404 without one), with its stored type, never sniffed, sandboxed;
 *   PUT     the image itself as the body: a PNG, JPEG or WebP (checked by its bytes, whatever its
 *           Content-Type says) of 2 MB or less, else 400 or 413 {detail, field: picture};
 *   DELETE  takes it away (back to the initials).
 * PUT and DELETE answer with the profile, its picture link changed.
 */
export const GET=repRoute(repId=>pictureResponse(ownPicture(repId)));

/** The body, read no further than one byte past the limit (savePicture then refuses it), whatever length it declares. */
async function boundedBody(request:Request,limit:number):Promise<Uint8Array>{
  const chunks:Uint8Array[]=[];let size=0;
  const reader=request.body?.getReader();
  if(!reader)return new Uint8Array();
  for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    chunks.push(value);size+=value.byteLength;
    if(size>limit){await reader.cancel();break;}
  }
  const bytes=new Uint8Array(size);let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  return bytes;
}

export const PUT=repRoute(async(repId,request)=>{
  // Refused before reading when the declared length is already too big.
  if(Number(request.headers.get('content-length')??0)>PICTURE_MAX_BYTES)return repJson({detail:PICTURE_TOO_BIG,field:'picture'},413);
  const bytes=await boundedBody(request,PICTURE_MAX_BYTES);
  try{return repJson(savePicture(repId,bytes));}catch(error){return profileError(error);}
});

export const DELETE=repRoute(repId=>{
  try{return repJson(removePicture(repId));}catch(error){return profileError(error);}
});
