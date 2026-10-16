import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// .env.example guard (docs/boxt/plan.md "Environment variables"): one real env file, .env.local
// (git-ignored), and a committed .env.example listing exactly the app's keys with placeholders only.

const ROOT=resolve(__dirname,'..');
const KEYS=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','ANTHROPIC_API_KEY','ANTHROPIC_MODEL','QUERENT_SCRIPTED','PORT'];
const SECRETS=['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','ANTHROPIC_API_KEY'];
const text=()=>readFileSync(join(ROOT,'.env.example'),'utf8');
const entries=()=>new Map(text().split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)] as const;}));
const ignored=(path:string)=>spawnSync('git',['check-ignore','-q',path],{cwd:ROOT}).status;

describe('.env.example',()=>{
  it('lists exactly the plan\'s keys, in order, as KEY=value lines',()=>{
    for(const line of text().split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')))expect(line).toMatch(/^[A-Z][A-Z0-9_]*=/);
    expect([...entries().keys()]).toEqual(KEYS);
  });

  it('holds placeholders only: secrets are empty and no value looks like a key',()=>{
    for(const key of SECRETS)expect(entries().get(key),key).toBe('');
    for(const [key,value] of entries()){
      expect(value,key).not.toMatch(/sk-|eyJ|[A-Za-z0-9_-]{24,}/);
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
