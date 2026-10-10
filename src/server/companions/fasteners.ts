// Fastener facts read from catalog descriptions, for the matching-fastener rule (spec §5.5; the rep
// upsell chips and the customer pop-up suggestions, spec §10):
// a graded bolt gets a nut of the same diameter, thread and grade, and a washer of the same
// diameter and grade. Descriptions follow "<name> <size>, <grade>, <finish>", e.g.
// "Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc". Pure, no server imports.

export type FastenerKind='bolt'|'nut'|'washer';

export interface FastenerSpec{
  kind:FastenerKind;
  /** Nominal diameter as printed: "1/2", "3/8", "1-1/2". */
  diameter:string;
  /** Threads per inch ("13" in 1/2-13); null for washers. */
  thread:string|null;
  /** "8", "5"; null when the description names no grade (SAE or lock washers, ungraded screws). */
  grade:string|null;
  /** A flat washer (preferred over other washers of the same size and grade). */
  flat:boolean;
}

/** The words before the size: "Hex cap screw 1/2-13 x 2 in, ..." -> "Hex cap screw". Tokens from the first one starting with a digit or # are dropped. */
export function itemName(description:string){
  const head=description.split(',')[0].trim().split(/\s+/);
  const size=head.findIndex(token=>/^[\d#]/.test(token));
  return (size<0?head:head.slice(0,size)).join(' ');
}

const DIAMETER='(\\d+(?:-\\d+\\/\\d+|\\/\\d+)?)';
const THREADED=new RegExp(`^${DIAMETER}-(\\d+)\\b`);
const PLAIN=new RegExp(`^${DIAMETER}(?![\\d/-])`);

function kindOf(name:string):FastenerKind|null{
  if(/\b(cap screw|bolt)$/i.test(name))return 'bolt';
  if(/\bnut$/i.test(name))return 'nut';
  if(/\bwasher$/i.test(name))return 'washer';
  return null;
}

/** The fastener in a catalog description, or null when it isn't a bolt, nut or washer we can size. */
export function fastenerSpec(description:string):FastenerSpec|null{
  const name=itemName(description);
  const kind=kindOf(name);
  if(!kind)return null;
  const size=description.slice(description.indexOf(name)+name.length).trim();
  const grade=/\bgrade\s+([0-9a-z.]+)\b/i.exec(description)?.[1].toUpperCase()??null;
  const flat=/\bflat\b/i.test(name);
  if(kind==='washer'){
    const plain=PLAIN.exec(size);
    return plain?{kind,diameter:plain[1],thread:null,grade,flat}:null;
  }
  const threaded=THREADED.exec(size);
  return threaded?{kind,diameter:threaded[1],thread:threaded[2],grade,flat}:null;
}

/** Whether `part` (a nut or washer) matches `bolt`: same diameter and grade, and for a nut the same thread. Only graded bolts match. */
export function matchesBolt(bolt:FastenerSpec,part:FastenerSpec){
  if(bolt.kind!=='bolt'||bolt.grade===null||part.kind==='bolt')return false;
  if(part.diameter!==bolt.diameter||part.grade!==bolt.grade)return false;
  return part.kind==='washer'||part.thread===bolt.thread;
}

/** Whether `part` is the same kind and size as `other` (a nut of the same diameter and thread, or any washer of the same diameter), whatever the grade. */
export function sameSize(part:FastenerSpec,other:FastenerSpec){
  return part.kind===other.kind&&part.diameter===other.diameter&&part.thread===other.thread;
}

/** Pieces in one pack: "Box of 50" -> 50, "Case of 1,000" -> 1000, "Each" -> 1; null when the pack doesn't say. */
export function piecesPerPack(pack:string){
  if(/^\s*each\s*$/i.test(pack))return 1;
  const count=/\bof\s+([\d,]+)/i.exec(pack)?.[1].replace(/,/g,'');
  const pieces=count?Number(count):NaN;
  return Number.isInteger(pieces)&&pieces>0?pieces:null;
}
