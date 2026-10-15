// The Supabase project the app talks to: its URL and anon (publishable) key, nothing privileged. With
// these and the user's session cookie every query runs as that user, so RLS applies (docs/boxt/plan.md
// "Environment variables").

export function supabaseEnv():{url:string;anonKey:string}{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anonKey)throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example; npm run db:env writes them for the local stack).');
  return {url,anonKey};
}
