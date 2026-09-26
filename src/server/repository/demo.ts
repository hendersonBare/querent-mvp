import 'server-only';
import {reseedDatabase} from '../db';
import {seedAnchorFromEnv} from '../db/seed';

/**
 * Test hook for the E2E suites (POST /api/test/reset): reseeds the whole demo in place.
 * `seedDate` (YYYY-MM-DD) pins the seed anchor; without it QUERENT_SEED_DATE, or yesterday, is
 * used. Throws, changing nothing, on a malformed date. Returns the anchor used.
 */
export function resetDemoData({seedDate}:{seedDate?:string}={}){
  const anchor=seedDate?.trim()?seedAnchorFromEnv({QUERENT_SEED_DATE:seedDate}):undefined;
  return reseedDatabase({anchor});
}
