import 'server-only';
import type {PictureType,RepPicture,RepProfile} from '@/domain';
import {initials} from '@/lib/initials';
import {repPicture,repProfile,setRepPicture,setRepProfile} from '@/server/repository';

// Settings > Profile (plan U9; C_RS2): the signed-in rep's picture, name, phone and email. Customers see them
// in the My rep sheet (GET /api/query/customer/contacts) and on quotes (the rep contact a send snapshots).
// Every function takes the signed-in rep's id from the session; nothing here names another rep.
//
// The picture is checked by its bytes, never by the type an upload claims: PNG, JPEG or WebP only (no SVG,
// which can carry script), 2 MB at most. It is served back with that type, sandboxed (./picture-response).
// No frame draws a refused field or picture, so each refusal is one plain sentence (decision 52).

/** The largest picture a rep may upload. */
export const PICTURE_MAX_BYTES=2*1024*1024;
const NAME_MAX=80,EMAIL_MAX=254,PHONE_MAX=40;

export const PICTURE_PROBLEM='Pick a PNG, JPEG or WebP picture.';
export const PICTURE_TOO_BIG='Pick a picture of 2 MB or less.';

/** A field the rep must change: 400 (or 413 for a picture over the limit), with the field it is about. */
export class ProfileError extends Error{
  constructor(message:string,readonly field:'name'|'phone'|'email'|'picture'|null,readonly status:400|404|413=400){super(message);this.name='ProfileError';}
}

/** Settings > Profile as the page and GET /api/rep/profile show it: no internal id, a link to the picture. */
export interface RepProfileView {name:string;initials:string;title:string;phone:string;email:string;picture_url:string|null}

/** The link a page shows the rep's own picture by; it changes whenever the picture does. */
export const ownPictureUrl=(updatedAt:string|null)=>updatedAt?`/api/rep/profile/picture?v=${Date.parse(updatedAt)}`:null;

const view=({name,initials:short,title,phone,email,picture_updated_at}:RepProfile):RepProfileView=>({name,initials:short,title,phone,email,picture_url:ownPictureUrl(picture_updated_at)});

function stored(repId:string){
  const profile=repProfile(repId);
  if(!profile)throw new ProfileError('Rep not found.',null,404);
  return profile;
}

/** GET /api/rep/profile: the signed-in rep's profile. */
export function profileView(repId:string):RepProfileView{return view(stored(repId));}

/** PNG, JPEG or WebP by the file's first bytes (its signature), or null for anything else: the PICTURE_TYPES the database accepts. */
export function pictureType(bytes:Uint8Array):PictureType|null{
  const starts=(sig:number[],at=0)=>bytes.length>=at+sig.length&&sig.every((b,i)=>bytes[at+i]===b);
  if(starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return 'image/png';
  if(starts([0xff,0xd8,0xff]))return 'image/jpeg';
  if(starts([0x52,0x49,0x46,0x46])&&starts([0x57,0x45,0x42,0x50],8))return 'image/webp';
  return null;
}

const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const PHONE=/^[0-9()+\-.\s/x]+$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PUT /api/rep/profile {name, phone, email}: all three, trimmed. Initials follow the new name (the My rep
 * sheet draws them while there is no picture). Any rep id in the body is ignored: it is always the signed-in rep.
 */
export function updateProfile(repId:string,input:unknown):RepProfileView{
  const body=typeof input==='object'&&input!==null&&!Array.isArray(input)?input as Record<string,unknown>:null;
  if(!body)throw new ProfileError('Enter your name.','name');
  const name=text(body.name).replace(/\s+/g,' '),phone=text(body.phone),email=text(body.email);
  if(!name)throw new ProfileError('Enter your name.','name');
  if(name.length>NAME_MAX)throw new ProfileError('Enter a name of 80 characters or fewer.','name');
  if(!phone||phone.length>PHONE_MAX||!PHONE.test(phone)||(phone.match(/\d/g)?.length??0)<7)throw new ProfileError('Enter a phone number.','phone');
  if(!email||email.length>EMAIL_MAX||!EMAIL.test(email))throw new ProfileError('Enter an email address.','email');
  stored(repId);
  return view(setRepProfile(repId,{name,initials:initials(name),phone,email})!);
}

/** PUT /api/rep/profile/picture (the image as the body): replaces the rep's picture. The old one stays on a refusal. */
export function savePicture(repId:string,bytes:Uint8Array,{now=new Date().toISOString()}:{now?:string}={}):RepProfileView{
  if(bytes.length>PICTURE_MAX_BYTES)throw new ProfileError(PICTURE_TOO_BIG,'picture',413);
  const type=pictureType(bytes);
  if(!type)throw new ProfileError(PICTURE_PROBLEM,'picture');
  stored(repId);
  setRepPicture(repId,{type,data:bytes,at:now});
  return profileView(repId);
}

/** DELETE /api/rep/profile/picture: the rep goes back to their initials. */
export function removePicture(repId:string):RepProfileView{
  stored(repId);
  setRepPicture(repId,null);
  return profileView(repId);
}

/** GET /api/rep/profile/picture: the signed-in rep's own picture, or undefined without one. */
export function ownPicture(repId:string):RepPicture|undefined{return repPicture(repId);}
