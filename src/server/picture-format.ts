import type {PictureType} from '@/domain';

/** PNG, JPEG or WebP by the file's first bytes (its signature), or null for anything else. */
export function pictureType(bytes:Uint8Array):PictureType|null{
  const starts=(sig:number[],at=0)=>bytes.length>=at+sig.length&&sig.every((b,i)=>bytes[at+i]===b);
  if(starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return 'image/png';
  if(starts([0xff,0xd8,0xff]))return 'image/jpeg';
  if(starts([0x52,0x49,0x46,0x46])&&starts([0x57,0x45,0x42,0x50],8))return 'image/webp';
  return null;
}
