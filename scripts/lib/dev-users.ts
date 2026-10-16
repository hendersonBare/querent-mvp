// LOCAL DEVELOPMENT ONLY. The users `npm run db:reset` creates on the local Supabase stack, which the
// test:db suite (and later the E2E suite) signs in as. The default password below is not a secret: it
// only ever exists on a local stack that `db:reset` refuses to touch unless it runs on 127.0.0.1 or
// localhost. Set QUERENT_DEV_PASSWORD to use another one. Never create these users on a real project.

export const DEV_USERS=[{email:'rep@boxt.test'},{email:'rep2@boxt.test'}] as const;

export const DEFAULT_DEV_PASSWORD='boxt-local-dev-only';

export const devPassword=()=>process.env.QUERENT_DEV_PASSWORD||DEFAULT_DEV_PASSWORD;
