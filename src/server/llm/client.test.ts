// @vitest-environment node
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const constructed=vi.hoisted(()=>[] as unknown[]);
vi.mock('@anthropic-ai/sdk',()=>{
  class FakeAnthropic{
    messages={create:vi.fn()};
    constructor(options:unknown){constructed.push(options);}
  }
  return {default:FakeAnthropic};
});

import {anthropicClient,DEFAULT_MODEL,llmMode,model,resetClientForTests} from './client';

describe('llmMode',()=>{
  it('is scripted when QUERENT_SCRIPTED=1, even with a key',()=>{
    expect(llmMode({QUERENT_SCRIPTED:'1',ANTHROPIC_API_KEY:'test-key'})).toBe('scripted');
  });
  it('is scripted when no key (or a blank key) is set',()=>{
    expect(llmMode({})).toBe('scripted');
    expect(llmMode({ANTHROPIC_API_KEY:'  '})).toBe('scripted');
  });
  it('is live with a key and no QUERENT_SCRIPTED',()=>{
    expect(llmMode({ANTHROPIC_API_KEY:'test-key'})).toBe('live');
    expect(llmMode({ANTHROPIC_API_KEY:'test-key',QUERENT_SCRIPTED:'0'})).toBe('live');
  });
});

describe('model',()=>{
  it('is ANTHROPIC_MODEL when set, else the one default',()=>{
    expect(model({ANTHROPIC_MODEL:' custom-model '})).toBe('custom-model');
    expect(model({})).toBe(DEFAULT_MODEL);
    expect(model({ANTHROPIC_MODEL:''})).toBe(DEFAULT_MODEL);
  });
});

describe('anthropicClient',()=>{
  beforeEach(()=>{constructed.length=0;resetClientForTests();});
  afterEach(()=>resetClientForTests());

  it('is created lazily, once, with an explicit timeout and bounded retries',()=>{
    expect(constructed).toHaveLength(0);
    const a=anthropicClient({ANTHROPIC_API_KEY:'test-key'});
    const b=anthropicClient({ANTHROPIC_API_KEY:'test-key'});
    expect(a).toBe(b);
    expect(constructed).toHaveLength(1);
    const options=constructed[0] as {apiKey:string;timeout:number;maxRetries:number};
    expect(options.apiKey).toBe('test-key');
    expect(options.timeout).toBeGreaterThanOrEqual(30_000);
    expect(options.timeout).toBeLessThanOrEqual(600_000);
    expect(options.maxRetries).toBeGreaterThanOrEqual(1);
    expect(options.maxRetries).toBeLessThanOrEqual(3);
  });
});

describe('the llm module',()=>{
  const dir=__dirname;
  const sources=readdirSync(dir).filter(f=>/\.ts$/.test(f)&&!/\.test\.ts$/.test(f));

  it('never calls console (no key, request or customer text is ever logged)',()=>{
    expect(sources.filter(f=>/console\./.test(readFileSync(join(dir,f),'utf8')))).toEqual([]);
  });

  it('names a model id only in client.ts',()=>{
    expect(sources.filter(f=>f!=='client.ts'&&/claude-[a-z]+-\d/.test(readFileSync(join(dir,f),'utf8')))).toEqual([]);
    expect(readFileSync(join(dir,'client.ts'),'utf8').match(/claude-[a-z]+-[\d-]+/g)).toEqual([DEFAULT_MODEL]);
  });
});
