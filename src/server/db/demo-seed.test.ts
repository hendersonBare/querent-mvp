import Database from 'better-sqlite3';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from './migrate';
import {seedDatabase} from './seed';
import {aging,effectiveStatus} from '../quotes';
import {allocateRecovery} from '../freight/recovery';
import {modelledDeliveryCost,COST_MODEL_DEFAULTS} from '../freight/cost-model';
import {haversineRoadMiles} from '../freight/distance';
import {POOL_DEFAULTS} from '../freight/pool';
import {toCents} from '@/lib/money';
import type {QuoteStatus} from '@/domain';

// The demo seed (v3 decisions 38 and 39; task F1): Mara's and Eli's books next to Brandi's, every
// time relative to the reset time, so every reset gives the same aging mix, the same pool and the
// same Team dashboard. The pool itself is checked through C1's repository in
// src/server/repository/demo-pool.test.ts.

const ANCHOR='2026-09-23';
const NOW='2026-10-10T12:00:00.000Z';
const LATER='2027-03-02T03:30:00.000Z';
const REASONS=['price_too_high','found_other_source','need_sooner','wrong_items','other'];

function open(now:string){const d=new Database(':memory:');d.pragma('foreign_keys = ON');migrate(d);seedDatabase(d,{anchor:ANCHOR,now});return d;}
type QuoteRow={id:string;quote_number:string;status:QuoteStatus;rep_id:string;original_rep_id:string;customer_id:string;created_at:string;responded_at:string|null;sent_at:string|null;valid_until:string|null;
  fulfillment:string;branch_id:string;ship_to_lat:number|null;ship_to_lng:number|null;freight_rate_bp:number|null;modelled_freight_cents:number|null;decline_reason:string|null;decline_note:string|null};

describe('the demo seed',()=>{
  let d:Database.Database,later:Database.Database;
  beforeAll(()=>{d=open(NOW);later=open(LATER);});
  afterAll(()=>{d.close();later.close();});
  const quotes=(db=d)=>db.prepare('SELECT * FROM quotes ORDER BY quote_number').all() as QuoteRow[];
  const levels=(db:Database.Database,now:string)=>Object.fromEntries(quotes(db).map(q=>[q.quote_number,[effectiveStatus(q,now),aging(q,now)?.level??null]]));

  it('gives Brandi, Mara and Eli each a fresh, an Aging and an Overdue open quote',()=>{
    for(const rep of ['brandi','mara','eli']){
      const mine=quotes().filter(q=>q.rep_id===rep).map(q=>aging(q,NOW)?.level).filter(Boolean);
      expect(new Set(mine),rep).toEqual(new Set(['ok','amber','red']));
    }
  });

  it('dates the mix from the reset time: a reset on another day gives the same statuses and aging levels',()=>{
    expect(levels(later,LATER)).toEqual(levels(d,NOW));
  });

  it('has amber and red sent quotes from the expiry rule, not only from their clocks',()=>{
    const sent=quotes().filter(q=>q.status==='sent'&&q.rep_id!=='brandi');
    const hoursSinceSent=(q:QuoteRow)=>(Date.parse(NOW)-Date.parse(q.sent_at!))/3_600_000;
    const byExpiry=sent.filter(q=>hoursSinceSent(q)<72&&aging(q,NOW)?.level!=='ok');
    expect(byExpiry.map(q=>aging(q,NOW)!.level).sort()).toEqual(['amber','red']);
  });

  it('has every status, declines with each reason (an Other note, and one with none) and expired quotes',()=>{
    expect([...new Set(quotes().map(q=>q.status))].sort()).toEqual(['accepted','changes_requested','declined','expired','ready_for_review','sent']);
    const declined=quotes().filter(q=>q.status==='declined');
    expect([...new Set(declined.map(q=>q.decline_reason))].filter(Boolean).sort()).toEqual([...REASONS].sort());
    expect(declined.some(q=>q.decline_reason===null)).toBe(true);
    expect(declined.find(q=>q.decline_reason==='other')!.decline_note).toBeTruthy();
    expect(declined.filter(q=>q.decline_reason!=='other').every(q=>q.decline_note===null)).toBe(true);
    const expired=quotes().filter(q=>q.status==='expired'&&q.customer_id!=='wasatch');
    expect(expired.length).toBeGreaterThanOrEqual(2);
    for(const q of expired)expect(q.valid_until!<NOW.slice(0,10),q.quote_number).toBe(true);
  });

  it('declines and expiries fall in the Team dashboard\'s 30-day preset, for both Mara and Eli',()=>{
    const since=new Date(Date.parse(NOW)-29*86_400_000).toISOString();
    for(const rep of ['mara','eli'])for(const status of ['declined','expired'])
      expect(quotes().filter(q=>q.rep_id===rep&&q.status===status&&q.created_at>=since).length,`${rep} ${status}`).toBeGreaterThan(0);
  });

  it('has quotes Brandi reassigned, each with an activity row naming both reps',()=>{
    const moved=quotes().filter(q=>q.original_rep_id!==q.rep_id);
    expect(moved.length).toBeGreaterThanOrEqual(3);
    expect(new Set(moved.map(q=>q.rep_id))).toEqual(new Set(['brandi','eli']));
    const name=(id:string)=>d.prepare('SELECT name FROM reps WHERE id=?').pluck().get(id);
    for(const q of moved){
      const rows=d.prepare("SELECT actor,actor_id,message FROM quote_activity WHERE quote_id=? AND kind='reassigned'").all(q.id);
      expect(rows,q.quote_number).toEqual([{actor:'rep',actor_id:'brandi',message:`Brandi Gallegos reassigned ${q.quote_number} from ${name(q.original_rep_id)} to ${name(q.rep_id)}`}]);
    }
    // Everyone else is the customer's own rep's.
    expect(d.prepare('SELECT count(*) FROM quotes q JOIN customer_rep c ON c.customer_id=q.customer_id WHERE q.original_rep_id<>c.rep_id').pluck().get()).toBe(0);
  });

  it('records pop-up suggestions offered and added, so the acceptance rate has both parts',()=>{
    const offered=d.prepare(`SELECT q.id,json_extract(p.payload,'$.suggestions_offered') offered,p.payload FROM quotes q JOIN messages r ON r.kind='quote_requested' AND json_extract(r.payload,'$.quote_id')=q.id
      JOIN messages p ON p.id=json_extract(r.payload,'$.popup_message_id')`).all() as {id:string;offered:number;payload:string}[];
    const total=offered.reduce((sum,o)=>sum+o.offered,0);
    const added=d.prepare("SELECT l.quote_id,i.sku FROM quote_lines l JOIN items i ON i.id=l.item_id WHERE l.added_by='suggestion'").all() as {quote_id:string;sku:string}[];
    expect(total).toBeGreaterThan(added.length);
    expect(added.length).toBeGreaterThan(0);
    for(const a of added){
      const popup=offered.find(o=>o.id===a.quote_id);
      expect(JSON.parse(popup!.payload).suggestions.map((s:{sku:string})=>s.sku),a.sku).toContain(a.sku);
    }
    expect(d.prepare("SELECT count(*) FROM quote_lines WHERE added_by='upsell'").pluck().get()).toBeGreaterThan(0);
  });

  it('freezes recovery as free delivery pricing would: the margin-weighted allocation, the modelled cost, $0.00 freight',()=>{
    const carrying=quotes().filter(q=>q.freight_rate_bp!==null);
    expect(carrying.length).toBeGreaterThan(20);
    for(const q of carrying){
      expect(q.fulfillment,q.quote_number).toBe('delivery');
      const lines=d.prepare('SELECT line_no,qty,unit_price,unit_cost,price_basis,freight_recovery FROM quote_lines WHERE quote_id=? ORDER BY line_no').all(q.id) as {line_no:number;qty:number;unit_price:number;unit_cost:number;price_basis:'customer';freight_recovery:number}[];
      expect(toCents(lines.reduce((sum,l)=>sum+l.qty*l.unit_price,0)),q.quote_number).toBeGreaterThanOrEqual(150_000);
      const expected=allocateRecovery({rateBp:q.freight_rate_bp!,lineCapBp:POOL_DEFAULTS.lineCapBp,lines:lines.map(l=>({line_no:l.line_no,qty:l.qty,unitPriceCents:toCents(l.unit_price),unitCostCents:toCents(l.unit_cost),basis:l.price_basis}))});
      expect(lines.map(l=>l.freight_recovery),q.quote_number).toEqual(expected.map(e=>e.freight_recovery));
      expect(lines.some(l=>l.freight_recovery>0),q.quote_number).toBe(true);
      const branch=d.prepare('SELECT lat,lng FROM branches WHERE id=?').get(q.branch_id) as {lat:number;lng:number};
      const miles=haversineRoadMiles(branch,{lat:q.ship_to_lat!,lng:q.ship_to_lng!});
      const c=COST_MODEL_DEFAULTS;
      expect(q.modelled_freight_cents,q.quote_number).toBe(modelledDeliveryCost({miles,mpg:c.mpg,fuelPriceCents:340,wearCentsPerMile:c.wearCentsPerMile,depreciationCentsPerMile:c.depreciationCentsPerMile,
        driverCentsPerHour:c.driverCentsPerHour,avgSpeedMph:c.avgSpeedMph,stopMinutes:c.stopMinutes}).cents);
      if(q.sent_at){
        const snapshot=JSON.parse(d.prepare('SELECT snapshot FROM quote_revisions WHERE quote_id=?').pluck().get(q.id) as string);
        expect(snapshot.freight,q.quote_number).toBe(0);
        expect(snapshot.lines.map((l:{unit_price:number})=>toCents(l.unit_price)),q.quote_number).toEqual(lines.map(l=>toCents(l.unit_price)+l.freight_recovery));
        expect(JSON.stringify(snapshot)).not.toMatch(/recover|freight_rate|modelled/i);
      }
    }
    // Every delivery quote of the demo book has its modelled cost; will call has none.
    for(const q of quotes().filter(q=>q.customer_id!=='wasatch'))expect(q.modelled_freight_cents===null,q.quote_number).toBe(q.fulfillment==='will_call');
  });

  it('keeps Q-24817 the highest number, so the next request is still Q-24818',()=>{
    expect(d.prepare('SELECT max(quote_number) FROM quotes').pluck().get()).toBe('Q-24817');
  });
});
