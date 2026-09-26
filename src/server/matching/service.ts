import 'server-only';
import type {ItemCandidate} from '@/domain';
import {catalogItems,purchasedItems} from '@/server/repository/customer';
import {scoreCatalog} from './scorer';

const USUAL=/\b(?:the\s+)?usual\b/i;

/** Repository-backed candidate search for the `search_items` chat tool. */
export function catalogMatches(customerId:string,query:string,{limit=10}:{limit?:number}={}):ItemCandidate[]{
  const rows=Number.isFinite(limit)?Math.min(50,Math.max(1,Math.floor(limit))):10;
  const history=USUAL.test(query)?purchasedItems(customerId):[];
  const scored=scoreCatalog(query,catalogItems(),history);
  const bestLexical=Math.max(0,...scored.map(candidate=>candidate.lexicalScore));
  return scored.filter(candidate=>candidate.lexicalScore===bestLexical).slice(0,rows)
    .map(({sku,description,pack,category_name,score})=>({sku,description,pack,category_name,score}));
}
