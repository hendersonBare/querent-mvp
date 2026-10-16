// @vitest-environment node
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {isLocalUrl,loadEnvLocal,mergeEnvFile,parseDotenv} from './env';

describe('parseDotenv',()=>{
  it('reads KEY=value lines, quotes, export and comments',()=>{
    expect(parseDotenv('# c\nA=1\nexport B="two words"\nC=\'x=y\'\nD=plain # note\n\nnot a line\nE=')).toEqual({A:'1',B:'two words',C:'x=y',D:'plain',E:''});
  });
});

describe('isLocalUrl',()=>{
  it('accepts this machine only',()=>{
    for(const url of ['http://127.0.0.1:54321','http://localhost:3000','postgresql://postgres:postgres@127.0.0.1:54322/postgres','postgres://u:p@localhost/db'])expect(isLocalUrl(url),url).toBe(true);
    for(const url of ['https://abc.supabase.co','postgresql://postgres:x@db.abc.supabase.co:5432/postgres','http://127.0.0.1.evil.example','',undefined,'not a url'])expect(isLocalUrl(url),String(url)).toBe(false);
  });
});

describe('mergeEnvFile',()=>{
  it('replaces managed keys in place, appends new ones, and keeps everything else (ANTHROPIC_* included)',()=>{
    const before='# mine\nANTHROPIC_API_KEY=placeholder\nNEXT_PUBLIC_SUPABASE_URL=https://old\nANTHROPIC_MODEL=m\nNEXT_PUBLIC_SUPABASE_URL=dup\nPORT=4000\n';
    expect(mergeEnvFile(before,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',QUERENT_SCRIPTED:'1'}))
      .toBe('# mine\nANTHROPIC_API_KEY=placeholder\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nANTHROPIC_MODEL=m\nPORT=4000\nQUERENT_SCRIPTED=1\n');
  });

  it('writes a fresh file',()=>{expect(mergeEnvFile('',{A:'1',B:'2'})).toBe('A=1\nB=2\n');});
});

describe('loadEnvLocal',()=>{
  const dir=mkdtempSync(join(tmpdir(),'env-local-'));
  afterEach(()=>{vi.unstubAllEnvs();});

  it('fills unset variables from .env.local; the shell wins',()=>{
    writeFileSync(join(dir,'.env.local'),'QUERENT_TEST_A=from-file\nQUERENT_TEST_B=from-file\n');
    vi.stubEnv('QUERENT_TEST_A','from-shell');
    vi.stubEnv('QUERENT_TEST_B',undefined as unknown as string);
    expect(loadEnvLocal(dir)).toEqual(['QUERENT_TEST_B']);
    expect(process.env.QUERENT_TEST_A).toBe('from-shell');
    expect(process.env.QUERENT_TEST_B).toBe('from-file');
    rmSync(dir,{recursive:true,force:true});
  });
});
