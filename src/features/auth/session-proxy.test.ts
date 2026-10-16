// @vitest-environment node
import {readdirSync} from 'node:fs';
import {join,relative,resolve,sep} from 'node:path';
import {describe,expect,it} from 'vitest';
// (Next 16 still names the matcher helper after middleware, proxy's former name.)
import {unstable_doesMiddlewareMatch} from 'next/experimental/testing/server';
import {routeDecision} from './session-proxy';
import {APP_HOME,isStaticAsset,loginPath,safeNext} from './paths';
import {config} from '../../proxy';

// The proxy's gate (docs/boxt/plan.md product rule 7, "Layout": src/proxy.ts). Every route class:
// public pages, public APIs, protected pages, protected APIs, static assets, and paths that do not exist.

describe('routeDecision: public pages',()=>{
  it.each(['/reset-password','/auth/confirm','/update-password'])('%s is open with or without a session',path=>{
    expect(routeDecision(path,false)).toBe('allow');
    expect(routeDecision(path,true)).toBe('allow');
  });

  it('/login is open without a session, and sends a signed-in user to the app',()=>{
    expect(routeDecision('/login',false)).toBe('allow');
    expect(routeDecision('/login',true)).toBe('redirect-app');
    expect(routeDecision('/login/',true)).toBe('redirect-app');
  });
});

describe('routeDecision: public APIs',()=>{
  it.each(['/api/auth/login','/api/auth/reset'])('%s is open without a session',path=>{
    expect(routeDecision(path,false)).toBe('allow');
    expect(routeDecision(path,true)).toBe('allow');
  });

  it('sign-out is open, so an expired session still lands on /login',()=>{
    expect(routeDecision('/api/auth/signout',false)).toBe('allow');
  });

  it('update-password needs the (recovery) session',()=>{
    expect(routeDecision('/api/auth/update-password',false)).toBe('unauthorized');
    expect(routeDecision('/api/auth/update-password',true)).toBe('allow');
  });

  it('only the exact paths are public, not look-alikes under them',()=>{
    for(const path of ['/api/auth/login/x','/api/auth/loginx','/api/auth','/api/auth/','/api/auth/signup','/api/auth/otp'])expect(routeDecision(path,false),path).toBe('unauthorized');
    for(const path of ['/login/x','/loginx','/auth','/auth/confirmx','/reset-password/x'])expect(routeDecision(path,false),path).toBe('redirect-login');
  });
});

describe('routeDecision: protected routes',()=>{
  it.each(['/','/quote-tool','/quotes','/quotes/3f2a','/settings','/anything'])('page %s needs a session',path=>{
    expect(routeDecision(path,false)).toBe('redirect-login');
    expect(routeDecision(path,true)).toBe('allow');
  });

  it.each(['/api','/api/anything','/api/quotes','/api/quotes/3f2a','/api/settings','/api/quote-tool/match','/api/catalog/search'])('API %s answers 401 without a session',path=>{
    expect(routeDecision(path,false)).toBe('unauthorized');
    expect(routeDecision(path,true)).toBe('allow');
  });

  it('/signup is not a public route (there is none): login redirect, never allow',()=>{
    for(const path of ['/signup','/sign-up','/register','/auth/signup'])expect(routeDecision(path,false),path).toBe('redirect-login');
  });

  it('is not fooled by a trailing slash, case or a public prefix',()=>{
    expect(routeDecision('/quote-tool/',false)).toBe('redirect-login');
    expect(routeDecision('/LOGIN',false)).toBe('redirect-login');
    expect(routeDecision('/API/quotes',false)).toBe('redirect-login');
    expect(routeDecision('/api/quotes/',false)).toBe('unauthorized');
    expect(routeDecision('/_next/staticx/x.js',false)).toBe('redirect-login');
  });
});

describe('routeDecision: static assets',()=>{
  it.each(['/_next/static/chunks/main.js','/_next/static/css/app.css','/_next/image','/favicon.ico','/querent-logo.png'])('%s is open',path=>{
    expect(routeDecision(path,false)).toBe('allow');
    expect(isStaticAsset(path),path).toBe(true);
  });

  // Only the files the matcher names are open, not any top-level name with a file extension.
  it.each(['/robots.txt','/x.svg','/evil.png','/quotes.png','/quote-tool.jpg','/secret.txt','/QUERENT-LOGO.PNG','/querent-logo.png/x','/querent-logo.pngx','/favicon.ico/x'])('%s is not a static asset: it needs a session',path=>{
    expect(isStaticAsset(path),path).toBe(false);
    expect(routeDecision(path,false)).toBe('redirect-login');
  });

  it('opens every file in public/ (the same list as the proxy matcher)',()=>{
    const root=resolve(__dirname,'../../../public');
    const files=readdirSync(root,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile())
      .map(entry=>`/${relative(root,join(entry.parentPath,entry.name)).split(sep).join('/')}`);
    expect(files.length).toBeGreaterThan(0);
    for(const path of files)expect(isStaticAsset(path),path).toBe(true);
  });

  it('an image-looking API path is still an API',()=>{
    expect(routeDecision('/api/quotes/x.png',false)).toBe('unauthorized');
  });
});

describe('safeNext: same-origin relative paths only',()=>{
  it('keeps a relative path with its query',()=>{
    expect(safeNext('/quotes')).toBe('/quotes');
    expect(safeNext('/quotes/3f2a?tab=lines')).toBe('/quotes/3f2a?tab=lines');
    expect(safeNext('/update-password')).toBe('/update-password');
  });

  it.each([
    '//evil.com','///evil.com','https://evil.com','http://evil.com/quotes','/\\evil.com','/\\/evil.com','\\\\evil.com',
    'javascript:alert(1)','evil.com','quotes','','  /quotes','/quotes\n','/\tevil','%2F%2Fevil.com','/login','/login?next=/x','/api/auth/signout',
  ])('refuses %j (falls back to the app home)',value=>{
    expect(safeNext(value)).toBe(APP_HOME);
  });

  it('refuses non-strings and very long values',()=>{
    expect(safeNext(undefined)).toBe(APP_HOME);
    expect(safeNext(null)).toBe(APP_HOME);
    expect(safeNext(['/quotes'])).toBe(APP_HOME);
    expect(safeNext(`/${'a'.repeat(3000)}`)).toBe(APP_HOME);
    expect(safeNext('//evil.com','/update-password')).toBe('/update-password');
  });

  it('never yields something a browser reads as another origin',()=>{
    for(const value of ['/%2F%2Fevil.com','/%5Cevil.com','/.//evil.com','/a/../../evil.com']){
      const result=safeNext(value);
      expect(new URL(result,'https://app.example').origin,value).toBe('https://app.example');
      expect(result.startsWith('//')).toBe(false);
    }
  });
});

describe('loginPath',()=>{
  it('carries the page asked for as next',()=>{
    expect(loginPath('/quote-tool')).toBe('/login?next=%2Fquote-tool');
    expect(loginPath('/quotes/3f2a','?tab=lines')).toBe('/login?next=%2Fquotes%2F3f2a%3Ftab%3Dlines');
  });

  it('drops an unsafe next',()=>{
    expect(loginPath('//evil.com')).toBe('/login');
  });
});

describe('the proxy matcher',()=>{
  it('runs on pages and APIs',()=>{
    for(const url of ['/','/quote-tool','/quotes/3f2a','/api/quotes','/api/auth/login','/login','/signup'])expect(unstable_doesMiddlewareMatch({config,url}),url).toBe(true);
  });

  it('skips build assets, image optimisation, the favicon and the real files in public/ only',()=>{
    for(const url of ['/_next/static/chunks/main.js','/_next/static/a.js','/_next/image?url=%2Fquerent-logo.png&w=64&q=75','/favicon.ico','/querent-logo.png'])expect(unstable_doesMiddlewareMatch({config,url}),url).toBe(false);
  });

  // Follow-up F2: an image extension does not make a path a public file.
  it('runs on API and page paths that end in an image extension',()=>{
    for(const url of ['/api/quotes/x.png','/api/quotes/x.svg','/api/settings/a.jpg','/quotes/x.svg','/quote-tool/x.webp','/x.svg','/querent-logo.png/x','/querent-logo.pngx','/_next/staticx/a.js','/favicon.ico/x'])expect(unstable_doesMiddlewareMatch({config,url}),url).toBe(true);
  });

  it('skips every file in public/ (add a new public file to the matcher, or it is gated like a page)',()=>{
    const files=readdirSync(resolve(__dirname,'../../../public'),{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile())
      .map(entry=>`/${relative(resolve(__dirname,'../../../public'),join(entry.parentPath,entry.name)).split(sep).join('/')}`);
    expect(files.length).toBeGreaterThan(0);
    for(const url of files)expect(unstable_doesMiddlewareMatch({config,url}),url).toBe(false);
  });
});
