import {expect,it} from 'vitest';
import {chatMode} from './mode';

it('is scripted without an API key, or whenever QUERENT_SCRIPTED=1',()=>{
  expect(chatMode({})).toBe('scripted');
  expect(chatMode({ANTHROPIC_API_KEY:''})).toBe('scripted');
  expect(chatMode({ANTHROPIC_API_KEY:'  '})).toBe('scripted');
  expect(chatMode({ANTHROPIC_API_KEY:'sk-test',QUERENT_SCRIPTED:'1'})).toBe('scripted');
  expect(chatMode({ANTHROPIC_API_KEY:'sk-test',QUERENT_SCRIPTED:'true'})).toBe('scripted');
});

it('is live with an API key unless scripted mode is forced',()=>{
  expect(chatMode({ANTHROPIC_API_KEY:'sk-test'})).toBe('live');
  expect(chatMode({ANTHROPIC_API_KEY:'sk-test',QUERENT_SCRIPTED:'0'})).toBe('live');
  expect(chatMode({ANTHROPIC_API_KEY:'sk-test',QUERENT_SCRIPTED:''})).toBe('live');
});

it('reads process.env by default',()=>{
  const saved={key:process.env.ANTHROPIC_API_KEY,scripted:process.env.QUERENT_SCRIPTED};
  try{
    process.env.ANTHROPIC_API_KEY='sk-test';delete process.env.QUERENT_SCRIPTED;
    expect(chatMode()).toBe('live');
    process.env.QUERENT_SCRIPTED='1';
    expect(chatMode()).toBe('scripted');
  }finally{
    if(saved.key===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=saved.key;
    if(saved.scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=saved.scripted;
  }
});
