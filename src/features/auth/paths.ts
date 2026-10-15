// Auth routing rules, pure and client-safe (docs/boxt/plan.md product rule 7, "Layout": src/proxy.ts).
// Which paths are open without a session, what the proxy does with every other request, and the one
// way a `next` value becomes a redirect target (same-origin relative paths only: no open redirect).

export const LOGIN_PATH='/login';
/** Where a signed-in user lands by default. */
export const APP_HOME='/quote-tool';
export const RESET_PATH='/reset-password';
export const UPDATE_PASSWORD_PATH='/update-password';
export const CONFIRM_PATH='/auth/confirm';

/**
 * Pages open without a session. /update-password is open here because the page checks the recovery
 * session itself (and sends a visitor without one back to /reset-password).
 */
export const PUBLIC_PAGES:ReadonlySet<string>=new Set([LOGIN_PATH,RESET_PATH,CONFIRM_PATH,UPDATE_PASSWORD_PATH]);
/**
 * APIs open without a session: sign in, ask for a reset link, and sign out (which only clears cookies,
 * so a stale tab's Sign out still lands on /login instead of a 401). Each checks the request's origin.
 */
export const PUBLIC_APIS:ReadonlySet<string>=new Set(['/api/auth/login','/api/auth/reset','/api/auth/signout']);

/** Build output, image optimisation and files served from public/ at the root (images, favicon, robots.txt). */
const STATIC=[/^\/_next\/static\//,/^\/_next\/image$/,/^\/[\w.-]+\.(?:png|jpe?g|gif|svg|ico|webp|avif|txt)$/];
export const isStaticAsset=(pathname:string)=>STATIC.some(pattern=>pattern.test(pathname));

const isApi=(pathname:string)=>pathname==='/api'||pathname.startsWith('/api/');
/** /quotes/ and /quotes are one route; matching is exact otherwise (Next routes are case-sensitive). */
const normalize=(pathname:string)=>pathname.length>1?pathname.replace(/\/+$/,'')||'/':pathname;

export type RouteDecision='allow'|'redirect-login'|'unauthorized'|'redirect-app';

/**
 * What the proxy does with a request for `pathname`:
 *   - static assets and public pages/APIs: allow (a signed-in user asking for /login: redirect-app);
 *   - anything else needs a session: allow with one; without, pages redirect-login and /api/* is
 *     unauthorized (401 JSON). Unknown paths (an account-creation page included: there is none) count as pages.
 */
export function routeDecision(pathname:string,hasUser:boolean):RouteDecision{
  if(isStaticAsset(pathname))return 'allow';
  const path=normalize(pathname);
  if(path===LOGIN_PATH)return hasUser?'redirect-app':'allow';
  if(PUBLIC_PAGES.has(path)||PUBLIC_APIS.has(path))return 'allow';
  if(hasUser)return 'allow';
  return isApi(path)?'unauthorized':'redirect-login';
}

const BASE='http://next.invalid';
const MAX_NEXT=2048;
/** Paths that make no sense to return to after signing in. */
const NOT_A_DESTINATION=[/^\/login(?:[/?#]|$)/,/^\/api\/auth\//];

/**
 * `value` as a same-origin relative redirect target (path, query and hash), else `fallback`.
 * Refused: anything not a string starting with one "/", protocol-relative and backslash forms
 * (//evil.com, /\evil.com), control characters, absolute URLs, and anything whose normalized path would
 * start with "//" (/.//evil.com). /login and the auth APIs fall back too.
 */
export function safeNext(value:unknown,fallback:string=APP_HOME):string{
  if(typeof value!=='string'||value.length>MAX_NEXT)return fallback;
  if(!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return fallback;
  if(/[\u0000-\u001f\u007f]/.test(value))return fallback;
  let url:URL;
  try{url=new URL(value,BASE);}catch{return fallback;}
  if(url.origin!==BASE||url.pathname.startsWith('//'))return fallback;
  const target=`${url.pathname}${url.search}${url.hash}`;
  return NOT_A_DESTINATION.some(pattern=>pattern.test(target))?fallback:target;
}

/** The login page, carrying where to go afterwards (when that is a safe target). */
export function loginPath(pathname:string,search=''):string{
  const next=safeNext(`${pathname}${search}`,'');
  return next?`${LOGIN_PATH}?next=${encodeURIComponent(next)}`:LOGIN_PATH;
}
