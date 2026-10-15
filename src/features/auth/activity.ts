import type {ActivityMetadata} from '@/server/repository';

// What the auth routes write to the activity log (docs/boxt/plan.md "Database"): fixed keys and values
// only, never the email or anything typed. Failed sign-ins are not logged here (there is no user to log
// them for, and an email typed into a failed sign-in is not ours to keep); Supabase Auth's own logs
// record them.

/** The `login` row's metadata. */
export const LOGIN_METADATA={method:'password'} as const satisfies ActivityMetadata;
