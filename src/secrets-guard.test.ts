// @vitest-environment node
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {describe,expect,it,vi} from 'vitest';

// Secrets guard (docs/boxt/plan.md "Layout", "Environment variables"; decision 9). The Claude key is
// read in one module only, src/server/llm/client.ts, marked TODO(R-2). The Supabase service-role key
// never reaches the app: no file under src/ names it (only scripts/ may read it), and no
// NEXT_PUBLIC_ variable, which Next inlines into the browser bundle, carries a service-role key. No
// console call logs a key or an env value, and no real-looking key is committed. Tests may set fake or
// empty values, so *.test.* files are exempt from the reader rules but not from the real-key scan.

const ROOT=resolve(__dirname,'..');
const ANTHROPIC_KEY=/\bANTHROPIC_API_KEY\b/;
const SERVICE_ROLE_KEY=/\bSUPABASE_SERVICE_ROLE_KEY\b/;
/** The one module that reads ANTHROPIC_API_KEY (task B4 creates it). */
const ANTHROPIC_READER='src/server/llm/client.ts';
/** A public (browser-inlined) variable that names a service-role key. */
const PUBLIC_SERVICE_ROLE=/\bNEXT_PUBLIC_\w*SERVICE_ROLE/;
/** Real-looking secrets: Anthropic keys, Supabase secret keys, JWTs (Supabase anon and service-role keys), token headers. */
const REAL_KEY=/sk-ant-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{16,}\.eyJ[A-Za-z0-9_-]{16,}|Token [A-Za-z0-9]{24,}/;

function walk(dir:string):string[]{
  if(!existsSync(dir))return [];
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];});
}
const sources=(dir:string)=>walk(join(ROOT,dir)).filter(p=>/\.(ts|tsx|mjs|js|sql|toml)$/.test(p)).map(p=>relative(ROOT,p).split('\\').join('/'));
const isTest=(file:string)=>/\.test\.tsx?$/.test(file);
const read=(file:string)=>readFileSync(join(ROOT,file),'utf8');
const SELF=['src/secrets-guard.test.ts','src/env-example.test.ts'];
const appFiles=()=>sources('src').filter(f=>!isTest(f));
const everything=()=>[...sources('src'),...sources('scripts'),...sources('e2e'),...sources('supabase')].filter(f=>!SELF.includes(f));

/** Every console.* call with its argument text, matched to the closing parenthesis. */
function consoleCalls(text:string){
  const calls:string[]=[];
  for(const match of text.matchAll(/console\.\w+\s*\(/g)){
    let depth=1,i=match.index!+match[0].length;
    for(;i<text.length&&depth;i++){if(text[i]==='(')depth++;else if(text[i]===')')depth--;}
    calls.push(text.slice(match.index,i));
  }
  return calls;
}

describe('secrets guard',()=>{
  it(`names ANTHROPIC_API_KEY under src/ only in ${ANTHROPIC_READER}`,()=>{
    expect(appFiles().filter(f=>f!==ANTHROPIC_READER&&ANTHROPIC_KEY.test(read(f)))).toEqual([]);
  });

  it('marks the Claude key reader with TODO(R-2), once it exists',()=>{
    if(existsSync(join(ROOT,ANTHROPIC_READER)))expect(read(ANTHROPIC_READER)).toMatch(/TODO\(R-2\)/);
  });

  it('never names SUPABASE_SERVICE_ROLE_KEY in app code (only scripts/ may read it)',()=>{
    expect(appFiles().filter(f=>SERVICE_ROLE_KEY.test(read(f)))).toEqual([]);
  });

  it('exposes no service-role key through a NEXT_PUBLIC_ variable',()=>{
    const files=[...everything(),'.env.example','.github/workflows/ci.yml','playwright.config.ts','next.config.ts'].filter(f=>existsSync(join(ROOT,f)));
    expect(files.filter(f=>PUBLIC_SERVICE_ROLE.test(read(f)))).toEqual([]);
  });

  it('never logs a key or an env value through console.*',()=>{
    const hits=[...sources('src'),...sources('scripts')].filter(f=>!SELF.includes(f))
      .flatMap(f=>consoleCalls(read(f)).filter(call=>/API_KEY|apiKey|api_key|SERVICE_ROLE|serviceRole|service_role|process\.env\b/.test(call)).map(call=>`${f}: ${call}`));
    expect(hits).toEqual([]);
  });

  it('finds no real-looking key anywhere in src, scripts, e2e or supabase',()=>{
    expect(everything().filter(f=>REAL_KEY.test(read(f)))).toEqual([]);
  });

  it('detects what it guards against (self-check)',()=>{
    expect(consoleCalls('console.log(`key ${process.env.ANTHROPIC_API_KEY}`, f(x));').join()).toMatch(/ANTHROPIC_API_KEY/);
    expect(PUBLIC_SERVICE_ROLE.test('process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
    expect(PUBLIC_SERVICE_ROLE.test('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY')).toBe(false);
    expect(REAL_KEY.test(`sk-ant-api03-${'x'.repeat(20)}`)).toBe(true);
    expect(REAL_KEY.test('eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIi')).toBe(true);
  });

  it('blanks the Claude key for the E2E server and in CI, so .env.local can never hand next start a real key',async()=>{
    // next start loads .env.local, but never overrides a variable already set (even to ''), so the
    // server Playwright starts runs scripted.
    vi.stubEnv('QUERENT_WEBSERVER','1');
    try{
      const {default:config}=await import('../playwright.config');
      const server=Array.isArray(config.webServer)?config.webServer[0]:config.webServer;
      expect(server?.env).toMatchObject({ANTHROPIC_API_KEY:''});
    }finally{vi.unstubAllEnvs();}
    expect(read('.github/workflows/ci.yml')).toMatch(/^\s+ANTHROPIC_API_KEY: ''$/m);
  });
});
