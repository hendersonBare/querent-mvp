import {describe,expect,it} from 'vitest';
import {demoDatabase,events,heartbeat} from './erp';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

describe('ERP connection status',()=>{
  it('shows the seeded refresh, with events for the supplier only',()=>{
    const status=events(false);
    expect(status.last_updated).toEqual(expect.any(String));
    expect(status.events).toEqual([]);
    expect(events(true).events).toEqual([expect.objectContaining({message:'ERP connection refreshed'})]);
  });

  it('records a heartbeat as the latest event and lists at most 10',()=>{
    for(let i=0;i<12;i++)heartbeat(`2099-01-01T00:00:${String(i).padStart(2,'0')}.000Z`);
    expect(events(false).last_updated).toBe('2099-01-01T00:00:11.000Z');
    const all=events(true).events;
    expect(all).toHaveLength(10);
    expect(all[0]).toMatchObject({timestamp:'2099-01-01T00:00:11.000Z',message:'ERP connection refreshed'});
  });
});

describe('demo database (Settings > Data sources)',()=>{
  it('describes the SQLite seed standing in for the ERP: seed day, schema, record counts and last ERP sync',async()=>{
    const {SCHEMA_VERSION}=await import('../db');
    const info=demoDatabase();
    expect(info).toMatchObject({seed_date:'2026-09-23',schema_version:SCHEMA_VERSION});
    expect(info.records).toMatchObject({customers:4,items:expect.any(Number),orders:expect.any(Number),quotes:expect.any(Number)});
    expect(info.records.items).toBeGreaterThanOrEqual(50);
    expect(info.records.orders).toBeGreaterThan(0);
    expect(info.records.quotes).toBeGreaterThan(0);
    // Every ERP-sourced row carries synced_at (spec §6.2); the seed stamps them all on the anchor day.
    expect(info.synced_at).toMatch(/^2026-09-23T/);
  });
});
