// @vitest-environment node
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// No sign-up anywhere (docs/boxt/plan.md product rule 7, B2): no page, route, link or call that creates
// an account, and no passwordless sign-in (OTP / magic link / OAuth), which could create one too. Accounts
// are made by an admin in the Supabase dashboard. The local stack has sign-ups off as well (test:db).

const ROOT=resolve(__dirname,'../../..');
function walk(dir:string):string[]{
  if(!existsSync(dir))return [];
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];});
}
const appFiles=()=>walk(join(ROOT,'src')).filter(p=>/\.(ts|tsx|js|jsx|mjs)$/.test(p)&&!/\.test\.tsx?$/.test(p)).map(p=>relative(ROOT,p).split('\\').join('/'));
const read=(file:string)=>readFileSync(join(ROOT,file),'utf8');

/** Calls that create accounts or sign in without a password. */
export const ACCOUNT_CREATION=/\.\s*(?:signUp|signInWithOtp|signInWithOAuth|signInAnonymously|signInWithIdToken|signInWithSSO|signInWithWeb3|inviteUserByEmail|createUser)\s*\(/;
/** Links, routes and copy that offer a sign-up. */
export const SIGN_UP_TEXT=/\/(?:signup|sign-up|register)\b|\bsign\s?up\b|create (?:an |your )?account/i;

describe('no sign-up',()=>{
  it('no app code calls a sign-up, invite or passwordless sign-in API',()=>{
    expect(appFiles().filter(f=>ACCOUNT_CREATION.test(read(f)))).toEqual([]);
  });

  it('no app code links to or offers a sign-up',()=>{
    expect(appFiles().filter(f=>SIGN_UP_TEXT.test(read(f)))).toEqual([]);
  });

  it('there is no sign-up route under src/app',()=>{
    expect(walk(join(ROOT,'src/app')).map(p=>relative(ROOT,p)).filter(p=>/sign-?up|register/i.test(p))).toEqual([]);
  });

  it('detects what it guards against (self-check)',()=>{
    expect(ACCOUNT_CREATION.test('await supabase.auth.signUp({email,password})')).toBe(true);
    expect(ACCOUNT_CREATION.test('await db.auth.signInWithOtp({email})')).toBe(true);
    expect(ACCOUNT_CREATION.test('await db.auth.signInWithPassword({email,password})')).toBe(false);
    expect(SIGN_UP_TEXT.test('<Link href="/signup">')).toBe(true);
    expect(SIGN_UP_TEXT.test('Sign up')).toBe(true);
    expect(SIGN_UP_TEXT.test('Sign in')).toBe(false);
  });
});
