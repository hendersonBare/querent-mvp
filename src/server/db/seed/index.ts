import type Database from 'better-sqlite3';
import {seedChatLogs} from './chat';
import {at} from './dates';
import {seedHistory} from './history';
import {inserter} from './insert';
import {seedReference} from './reference';
import {seedSampleQuote} from './sample-quote';

export {seedSampleQuote,SAMPLE_QUOTE} from './sample-quote';
export {seedAnchorFromEnv} from './dates';

export interface SeedOptions{
  /** YYYY-MM-DD: the day Dana sent the Q-24817 request. Every seeded date is relative to it. */
  anchor:string;
}

/** Fills an empty database with the Query to Quote demo (spec §2, task 0.2). */
export function seedDatabase(database:Database.Database,{anchor}:SeedOptions){
  const context={insert:inserter(database),anchor,syncedAt:at(anchor,0,'12:00')};
  database.transaction(()=>{
    seedReference(context);
    seedHistory(context);
    seedChatLogs(context);
    seedSampleQuote(database,anchor);
    context.insert('meta',{key:'seed_anchor',value:anchor});
    context.insert('sync_events',{timestamp:new Date().toISOString(),message:'ERP connection refreshed'});
  })();
}
