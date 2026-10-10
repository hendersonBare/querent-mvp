import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

// The demo seed's pool (v3 decision 39; spec §4.4; task F1), through C1's repository on a freshly
// seeded database: more than 20 eligible accepted delivery quotes from the last 90 days, across
// Brandi, Mara and Eli, so the computed pool rate (not the 3.0% starting rate) is the one in force.
// The seed dates them from the reset time, so this holds on any day.

describe('the seeded pool',()=>{
  it('has more than 20 eligible accepted delivery quotes in the trailing 90 days, across the three reps',async()=>{
    const {poolInputs,poolWindow}=await import('./freight');
    const {all}=await import('./sql');
    const now=new Date().toISOString();
    const inputs=poolInputs(now);
    expect(inputs.count).toBeGreaterThan(20);
    expect(inputs.modelledCents).toBeGreaterThan(0);
    const reps=all<{rep_id:string}>(`SELECT DISTINCT rep_id FROM quotes WHERE status='accepted' AND fulfillment='delivery' AND freight_rate_bp IS NOT NULL
      AND responded_at>=@from AND responded_at<=@to ORDER BY rep_id`,poolWindow(now)).map(r=>r.rep_id);
    expect(reps).toEqual(['brandi','eli','mara']);
  });

  it('computes a pool rate that replaces the starting rate, under the cap',async()=>{
    const {cachedPoolRate}=await import('./freight');
    const {freightRateSettings}=await import('./settings');
    const pool=cachedPoolRate(new Date().toISOString());
    const {startingRateBp,rateCapBp}=freightRateSettings();
    expect(pool.on).toBe(true);
    expect(pool.rateBp).not.toBeNull();
    expect(pool.rateBp).not.toBe(startingRateBp);
    expect(pool.rateBp!).toBeGreaterThan(0);
    expect(pool.rateBp!).toBeLessThan(rateCapBp);
  });
});
