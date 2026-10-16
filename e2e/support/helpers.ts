import {join} from 'node:path';
import {expect,type APIRequestContext,type Page} from '@playwright/test';
import {DEV_USERS,devPassword} from '../../scripts/lib/dev-users';
import {adminQuery} from '../../scripts/lib/local-admin';
import {ROOT} from './stack';

// Shared bits for the specs: the dev users (npm run db:reset creates them), screenshots, sign-in, and
// a few direct reads of the LOCAL database through scripts/lib/local-admin.ts (it refuses any other).

export const REP=DEV_USERS[0].email;
/** The password-reset spec changes this user's password (and restores it), so no other spec signs in as it. */
export const REP2=DEV_USERS[1].email;
export {devPassword,adminQuery};

/** The page's own alert (Next's route announcer is an empty role=alert on every page, so it is left out). */
export const alert=(page:Page)=>page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** A browser context with no session. */
export const SIGNED_OUT={cookies:[],origins:[]};

/** The screenshots for the final report, at the suite's 1440x900 viewport (git-ignored). */
export const SCREENSHOTS=join(ROOT,'e2e/screenshots');
export const shot=(page:Page,name:string)=>page.screenshot({path:join(SCREENSHOTS,`${name}.png`)});

/** Signs in through the login form and waits for the page it lands on. */
export async function signIn(page:Page,email:string,password:string,{expectPath='/quote-tool'}:{expectPath?:string}={}){
  if(!/\/login(\?|$)/.test(page.url()))await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(url=>url.pathname===expectPath);
}

/** The seeded example quote's id. */
export async function exampleQuoteId():Promise<string>{
  const rows=await adminQuery('select id from public.quotes where is_example');
  expect(rows).toHaveLength(1);
  return rows[0].id as string;
}

/** Saves a quote through the app's API (as the signed-in user of `request`) and returns its id. */
export async function createQuote(request:APIRequestContext,body:unknown):Promise<string>{
  const response=await request.post('/api/quotes',{data:body});
  expect(response.status(),await response.text()).toBe(201);
  return (await response.json()).id as string;
}

/** Lines that give the same outcome every run under Strict with the scripted parser and judge (checked against the real catalog). */
export const LINES={
  /** Matches 12108-BDL (the 12x10x8" 32 ECT box, bundle pricing); qty 10 bundles. */
  box:'12 x 10 x 8" Corrugated Boxes, 32 ECT   10 bundles',
  /** Matches PB3669 (the 30x30" 2 mil reclosable bag); qty 2 cases. */
  bags:'Reclosable Poly Bags 30 x 30" 2 Mil, qty 2 cases',
  /** No match under Strict (coloured variants come within the lead); SF188CAST is its first near-miss. */
  wrap:'Cast Stretch Wrap 18" x 1500\' 80 Gauge   4 rolls',
  /** No match under Strict, BW12S12P under Balanced (final B3b scorer): the settings spec's line. */
  bubble:'Bubble Rolls 12" x 250\'   2 rolls',
} as const;
