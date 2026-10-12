import 'server-only';
import type {RepPicture} from '@/domain';

// A rep's picture as an HTTP response (plan U9): GET /api/rep/profile/picture (the rep's own) and
// GET /api/query/customer/contacts/picture (the customer's own rep). The bytes were checked as PNG, JPEG or
// WebP on upload (src/server/rep/profile.ts), and go out with that stored type only: never sniffed, shown
// inline as an image, sandboxed with nothing allowed to load. Private: only the signed-in viewer may cache it,
// and the page's link changes (?v=) whenever the picture does.

const NOT_FOUND={'Cache-Control':'no-store'} as const;

export function pictureResponse(picture:RepPicture|undefined){
  if(!picture)return Response.json({detail:'No picture.'},{status:404,headers:NOT_FOUND});
  return new Response(new Uint8Array(picture.data),{headers:{
    'Content-Type':picture.type,
    'Content-Length':String(picture.data.byteLength),
    'Content-Disposition':'inline',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; sandbox",
    'Cache-Control':'private, no-cache',
  }});
}
