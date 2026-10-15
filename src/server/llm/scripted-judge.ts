import judgeFixture from './fixtures/judge.json';
import {NO_CANDIDATES,withinCandidates} from './verdicts';
import type {Judge,JudgeVerdict} from './types';

// The scripted judge (QUERENT_SCRIPTED=1, or no API key): deterministic and offline. A line whose
// normalized description (or raw text) has a recorded verdict in fixtures/judge.json gets that
// verdict; any other line gets the first candidate. It never answers a SKU outside the list.
// No server-only import here, so evaluation scripts can use it outside Next.

export const SCRIPTED_FIRST_CANDIDATE='scripted_first_candidate';

/** The fixture key for a description: lowercase, plain quote marks, "12 x 10 x 8" as "12x10x8", single spaces, no trailing punctuation. */
export function judgeKey(text:string):string{
  return text.normalize('NFKC').toLowerCase()
    .replace(/[“”″]/g,'"').replace(/[‘’′]/g,'\'')
    .replace(/(\d(?:\.\d+)?["']?)\s*[x×]\s*(?=\d)/g,'$1x')
    .replace(/\s+/g,' ').trim()
    .replace(/[\s.,;:]+$/,'');
}

export interface ScriptedJudgeOptions {
  /** judgeKey(description) → verdict. Defaults to fixtures/judge.json. */
  verdicts?:Record<string,JudgeVerdict>;
}

export function createScriptedJudge({verdicts=judgeFixture as Record<string,JudgeVerdict>}:ScriptedJudgeOptions={}):Judge{
  const recorded=new Map(Object.entries(verdicts).map(([key,verdict])=>[judgeKey(key),verdict]));
  return {
    async judge(line,candidates){
      if(!candidates.length)return {sku:null,reason:NO_CANDIDATES};
      const verdict=recorded.get(judgeKey(line.description))??recorded.get(judgeKey(line.rawText));
      if(verdict)return withinCandidates({sku:verdict.sku,reason:verdict.reason},candidates);
      return {sku:candidates[0].sku,reason:SCRIPTED_FIRST_CANDIDATE};
    },
  };
}
