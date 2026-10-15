// @vitest-environment node
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {describe,expect,it,vi} from 'vitest';

// Secrets guard (decision 9, spec §11, plan T1). Keys are read server-side only, in a known set of
// modules that each carry TODO(R-2), and no console call ever logs one. Tests may set fake or empty
// values to pick scripted or live mode, so *.test.* files are exempt from the module allow-list but
// not from the real-key scan.

const ROOT=resolve(__dirname,'..');
const KEY_NAMES=/\b(ANTHROPIC_API_KEY|OILPRICEAPI_KEY)\b/;
// The modules that read a key (or hand it to the SDK). The fuel price client is C3's (spec §4.3); the
// pop-up suggestion picker is E1's (spec §10). The BOXT quote tool's parser and judge read it in
// src/server/llm/client.ts only (docs/boxt/plan.md, "LLM contract").
const KEY_READERS=['src/server/llm/client.ts','src/server/chat/mode.ts','src/server/chat/live.ts','src/server/upsells-writer/claude.ts','src/server/customer/suggestion-picker.ts','src/server/freight/fuel-price.ts'];

function walk(dir:string):string[]{
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];});
}
const sources=(dir:string)=>walk(join(ROOT,dir)).filter(p=>/\.(ts|tsx|mjs|js)$/.test(p)).map(p=>relative(ROOT,p).split('\\').join('/'));
const isTest=(file:string)=>/\.test\.tsx?$/.test(file);
const read=(file:string)=>readFileSync(join(ROOT,file),'utf8');
const SELF=['src/secrets-guard.test.ts','src/env-example.test.ts'];

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
  it('names ANTHROPIC_API_KEY and OILPRICEAPI_KEY only in the key-reading modules',()=>{
    const found=sources('src').filter(f=>!isTest(f)&&KEY_NAMES.test(read(f)));
    expect(found.filter(f=>!KEY_READERS.includes(f))).toEqual([]);
    expect(found.length).toBeGreaterThan(0);
  });

  it('marks every key-reading module with TODO(R-2)',()=>{
    for(const file of KEY_READERS.filter(f=>sources('src').includes(f)))expect(read(file),file).toMatch(/TODO\(R-2\)/);
  });

  it('never logs a key through console.*',()=>{
    const hits=[...sources('src'),...sources('scripts')].filter(f=>!SELF.includes(f))
      .flatMap(f=>consoleCalls(read(f)).filter(call=>/API_KEY|apiKey|api_key|OILPRICEAPI|process\.env\b(?!\.(DATABASE_PATH|QUERENT_SEED_DATE)\b)/.test(call)).map(call=>`${f}: ${call}`));
    expect(hits).toEqual([]);
  });

  it('finds no real-looking key anywhere in src, scripts or e2e',()=>{
    const hits=[...sources('src'),...sources('scripts'),...sources('e2e')].filter(f=>!SELF.includes(f)&&/sk-ant-[A-Za-z0-9_-]{16,}|Token [A-Za-z0-9]{24,}/.test(read(f)));
    expect(hits).toEqual([]);
  });

  it('detects a console call that logs a key (self-check)',()=>{
    expect(consoleCalls('console.log(`key ${process.env.ANTHROPIC_API_KEY}`, f(x));').join()).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('blanks both keys for the E2E server and in CI, so .env.local can never hand next start a real key',async()=>{
    // next start loads .env.local, but never overrides a variable already set (even to ''), so the
    // server Playwright starts runs scripted, with no fuel price API.
    vi.stubEnv('QUERENT_WEBSERVER','1');
    try{
      const {default:config}=await import('../playwright.config');
      const server=Array.isArray(config.webServer)?config.webServer[0]:config.webServer;
      expect(server?.env).toMatchObject({ANTHROPIC_API_KEY:'',OILPRICEAPI_KEY:''});
    }finally{vi.unstubAllEnvs();}
    const ci=read('.github/workflows/ci.yml');
    for(const key of ['ANTHROPIC_API_KEY','OILPRICEAPI_KEY'])expect(ci).toMatch(new RegExp(`^\\s+${key}: ''$`,'m'));
  });
});
