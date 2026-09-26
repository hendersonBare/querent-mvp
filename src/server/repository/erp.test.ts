import {describe,expect,it} from 'vitest';
import {events,heartbeat} from './erp';
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
