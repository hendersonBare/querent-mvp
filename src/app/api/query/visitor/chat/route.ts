// The visitor box's stub (plan U10; decision 49; C_CVE0). With no session, the customer site's box
// sends questions here. It always answers "Sign in to continue." and never calls the model or any
// tool, and it imports nothing, so no prices, orders, quotes or account data can come back through it.
// TODO(R-14): the real anonymous query route: public tool allow-list, rate limit, CORS, then Supabase auth and embed.
export const dynamic='force-dynamic';

const REPLY='Sign in to continue.';

export async function POST(){
  return Response.json({answer:REPLY});
}
