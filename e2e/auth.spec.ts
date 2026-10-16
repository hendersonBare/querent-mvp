import {expect,test,type Page} from '@playwright/test';
import {REP,REP2,SIGNED_OUT,alert,devPassword,shot,signIn} from './support/helpers';

// Sign-in, sign-out and the password reset (docs/boxt/plan.md B2, B8; product rule 7), in a browser
// with no session.

test.use({storageState:SIGNED_OUT});
test.describe.configure({mode:'serial'});

const MAILPIT=process.env.MAILPIT_URL||'http://127.0.0.1:54324';
/** supabase/config.toml [auth] site_url: the origin GoTrue writes into every email link. */
const SITE_URL='http://127.0.0.1:3000';

test('a wrong password is refused with one message; the right one opens the quote tool',async({page})=>{
  await page.goto('/login');
  await expect(page.getByRole('heading',{name:'Sign in'})).toBeVisible();
  await shot(page,'01-login');

  await page.getByLabel('Email').fill(REP);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(alert(page)).toHaveText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login$/);

  // An unknown account reads exactly the same.
  await page.getByLabel('Email').fill('nobody@boxt.test');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(alert(page)).toHaveText('Email or password is incorrect.');

  await signIn(page,REP,devPassword());
  await expect(page.getByRole('button',{name:'Find matches'})).toBeVisible();
  await expect(page.getByText(REP)).toBeVisible();
});

test('a page asked for while signed out opens after sign-in (next)',async({page})=>{
  await page.goto('/quotes');
  await expect(page).toHaveURL(/\/login\?next=%2Fquotes$/);
  await signIn(page,REP,devPassword(),{expectPath:'/quotes'});
  await expect(page.getByRole('table',{name:'Quotes'})).toBeVisible();
});

test('an unsafe next falls back to the quote tool',async({page})=>{
  await page.goto('/login?next=%2F%2Fevil.example%2Fx');
  await signIn(page,REP,devPassword(),{expectPath:'/quote-tool'});
});

test('Sign out ends the session',async({page})=>{
  await signIn(page,REP,devPassword());
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
  expect((await page.request.get('/api/settings')).status()).toBe(401);
});

/** The newest reset email to `email` that arrived after `since`, from Mailpit's API. */
async function resetEmail(email:string,since:number):Promise<{subject:string;html:string}>{
  let found:{subject:string;html:string}|null=null;
  await expect.poll(async()=>{
    const list=await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json() as {messages:{ID:string;Created:string;Subject:string}[]};
    const fresh=list.messages.filter(m=>Date.parse(m.Created)>=since-1000);
    if(!fresh.length)return false;
    const message=await (await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`)).json() as {HTML:string;Subject:string};
    found={subject:message.Subject,html:message.HTML};
    return true;
  },{message:`a reset email to ${email} in Mailpit (${MAILPIT})`,timeout:20_000}).toBe(true);
  return found!;
}

async function setNewPassword(page:Page,password:string){
  await page.getByLabel('New password',{exact:true}).fill(password);
  await page.getByLabel('Confirm new password').fill(password);
  await page.getByRole('button',{name:'Set new password'}).click();
}

test('password reset: request, email in Mailpit, link, new password, sign in with it',async({page})=>{
  const newPassword=`e2e-reset-${Date.now()}`;
  try{
    await page.goto('/login');
    await page.getByRole('link',{name:'Forgot password?'}).click();
    await expect(page).toHaveURL(/\/reset-password$/);
    const since=Date.now();
    await page.getByLabel('Email').fill(REP2);
    await page.getByRole('button',{name:'Send reset link'}).click();
    await expect(page.getByRole('status')).toHaveText('If an account exists for that email, we sent a link to reset the password.');

    const mail=await resetEmail(REP2,since);
    expect(mail.subject).toBe('Reset your BOXT quote tool password');
    const href=/href="([^"]+)"/.exec(mail.html)?.[1]?.replaceAll('&amp;','&');
    expect(href,'the email links somewhere').toBeTruthy();
    // supabase/templates/recovery.html builds the link from {{ .SiteURL }}, which the local stack fixes
    // at http://127.0.0.1:3000 (supabase/config.toml). This suite's server runs on a free port, so the
    // link's origin is swapped for it; the token itself is not tied to an origin.
    const link=new URL(href!);
    expect(link.origin).toBe(SITE_URL);
    expect(link.pathname).toBe('/auth/confirm');
    expect(link.searchParams.get('type')).toBe('recovery');
    expect(link.searchParams.get('token_hash')).toBeTruthy();
    await page.goto(`${link.pathname}${link.search}`);
    await expect(page).toHaveURL(/\/update-password$/);
    await expect(page.getByText(REP2)).toBeVisible();

    await setNewPassword(page,'short');
    await expect(alert(page)).toHaveText('Use at least 8 characters.');
    await setNewPassword(page,newPassword);
    await expect(page).toHaveURL(/\/quote-tool$/);

    // The link works once.
    const reused=await page.request.get(`${link.pathname}${link.search}`,{maxRedirects:0});
    expect(reused.headers().location).toBe('/reset-password?error=expired');

    await page.getByRole('button',{name:'Sign out'}).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(REP2);
    await page.getByLabel('Password').fill(devPassword());
    await page.getByRole('button',{name:'Sign in'}).click();
    await expect(alert(page)).toHaveText('Email or password is incorrect.');
    await signIn(page,REP2,newPassword);
  }finally{
    // Leave REP2's password as db:reset set it: sign in with whichever password works and set it back.
    const request=page.context().request;
    for(const password of [newPassword,devPassword()]){
      if((await request.post('/api/auth/login',{data:{email:REP2,password}})).ok())break;
    }
    const restored=await request.post('/api/auth/update-password',{data:{password:devPassword(),confirm:devPassword()}});
    // 400 "same password" when the reset never changed it.
    expect([200,400]).toContain(restored.status());
  }
  await page.context().clearCookies();
  await signIn(page,REP2,devPassword());
});
