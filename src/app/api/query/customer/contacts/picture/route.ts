import {customerSession} from '@/server/customer/http';
import {customerRepPicture} from '@/server/customer/sidebar';
import {pictureResponse} from '@/server/picture-response';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/query/customer/contacts/picture: the picture of the signed-in customer's own rep, for the My rep
 * sheet (plan U9, C_CVL3), set on the rep's Settings > Profile. 404 when the rep has none. Same refusals as
 * every customer route (401, 403 for the supplier).
 */
export function GET(request:Parameters<typeof customerSession>[0]){
  const {session,refusal}=customerSession(request);
  if(refusal)return refusal;
  return pictureResponse(customerRepPicture(session.customerId));
}
