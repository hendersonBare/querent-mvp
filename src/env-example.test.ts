import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// .env.example guard (decision 9, spec §11): one real env file, .env.local (git-ignored), and a
// committed .env.example listing every key with placeholders only. JEV_API_KEY is never added.

const ROOT=resolve(__dirname,'..');
const KEYS=['ANTHROPIC_API_KEY','ANTHROPIC_MODEL','DATABASE_PATH','OILPRICEAPI_KEY','QUERENT_SEED_DATE','QUERENT_SCRIPTED','QUERENT_E2E_RESET','PORT'];
/** Decision 48: the feature flags, off by default (empty). */
const FLAGS=['FEATURE_FREE_DELIVERY_PRICING','FEATURE_RECOVERY_POOL','FEATURE_DELIVERY_COST_MODEL'];
const SECRETS=['ANTHROPIC_API_KEY','OILPRICEAPI_KEY'];
const text=()=>readFileSync(join(ROOT,'.env.example'),'utf8');
const entries=()=>new Map(text().split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)] as const;}));
const ignored=(path:string)=>spawnSync('git',['check-ignore','-q',path],{cwd:ROOT}).status;

describe('.env.example',()=>{
  it('lists every key from decision 9, as KEY=value lines',()=>{
    for(const line of text().split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')))expect(line).toMatch(/^[A-Z][A-Z0-9_]*=/);
    expect([...entries().keys()]).toEqual(expect.arrayContaining(KEYS));
  });

  it('lists the three feature flags of decision 48, each off (empty)',()=>{
    for(const key of FLAGS)expect(entries().get(key),key).toBe('');
  });

  it('never mentions JEV_API_KEY',()=>{expect(text()).not.toMatch(/JEV_API_KEY/);});

  it('holds placeholders only: secrets are empty and no value looks like a key',()=>{
    for(const key of SECRETS)expect(entries().get(key),key).toBe('');
    for(const [key,value] of entries()){
      expect(value,key).not.toMatch(/sk-|[A-Za-z0-9_-]{24,}/);
      expect(value,key).not.toMatch(/@|\d{3}[-. ]\d{4}/);
    }
  });

  it('carries the TODO(R-2) note about moving keys to user secrets',()=>{expect(text()).toMatch(/TODO\(R-2\).*secret/i);});

  it('is committed, while .env.local stays git-ignored',()=>{
    expect(ignored('.env.example')).toBe(1);
    expect(ignored('.env.local')).toBe(0);
    expect(readFileSync(join(ROOT,'.gitignore'),'utf8').split('\n')).not.toContain('.env.example');
  });
});
