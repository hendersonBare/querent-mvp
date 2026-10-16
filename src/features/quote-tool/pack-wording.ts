// Stub for the failing-first run: the old reader (statedPack), so the tests show the old silent conversions.
import {statedPack} from './units';
export interface StatedPack {count:number;per:string|null;text:string}
export interface PackReading {packs:StatedPack[];unread:string|null}
export function readPacks(description:string|null|undefined,rawText:string|null|undefined,_quantity:number|null,_unit:string|null):PackReading{
  return statedPack(description,rawText) as unknown as PackReading;
}
