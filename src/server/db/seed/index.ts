import type Database from 'better-sqlite3';
import {seedAgingQuotes} from './aging';
import {seedChatLogs} from './chat';
import {at} from './dates';
import {seedHistory} from './history';
import {backfillOriginalReps,inserter} from './insert';
import {seedReference,seedRepRoles} from './reference';
import {seedSampleQuote} from './sample-quote';

export {seedSampleQuote,SAMPLE_QUOTE} from './sample-quote';
export {seedAnchorFromEnv} from './dates';

export interface SeedOptions{
  /** YYYY-MM-DD: the day Dana sent the Q-24817 request. Every seeded date is relative to it. */
  anchor:string;
  /** The reset time: the aging quotes (./aging) are relative to it, not the anchor. Now by default. */
  now?:string;
}

/** Fills an empty database with the Query to Quote demo (spec §2, task 0.2). */
export function seedDatabase(database:Database.Database,{anchor,now=new Date().toISOString()}:SeedOptions){
  const context={insert:inserter(database),anchor,syncedAt:at(anchor,0,'12:00')};
  database.transaction(()=>{
    seedReference(context);
    seedRepRoles(database);
    seedHistory(context);
    seedChatLogs(context);
    seedSampleQuote(database,anchor);
    seedAgingQuotes(context,now);
    backfillOriginalReps(database);
    context.insert('meta',{key:'seed_anchor',value:anchor});
    context.insert('sync_events',{timestamp:new Date().toISOString(),message:'ERP connection refreshed'});
  })();
}
