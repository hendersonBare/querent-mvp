import {describe,expect,it} from 'vitest';
import type {TeamQuoteFact} from '@/domain';
import {CSV_BOM} from '@/server/export/csv';
import {AGING_DEFAULTS} from '@/server/quotes';
import {TEAM_CSV_COLUMNS,teamMetricsCsv} from './csv';
import {teamMetricRows} from './metrics';

// Export CSV on the Team dashboard (v3 spec §5, §6 Team; decision 23; task D3): the leaderboard's
// rows through src/server/export/csv.ts, one line per rep plus the totals, with clear headers.

const NOW='2026-10-10T12:00:00.000Z';
const fact:TeamQuoteFact={id:'q1',quote_number:'Q-1',rep_id:'mara',status:'accepted',created_at:'2026-10-01T00:00:00.000Z',sent_at:'2026-10-01T02:00:00.000Z',
  responded_at:'2026-10-02T02:00:00.000Z',valid_until:'2026-10-15',fulfillment:'delivery',last_rep_touch_at:null,customer_viewed_at:null,decline_reason:null,decline_note:null,
  declined_at:null,sent_total:1234.5,draft_total:null,priced_subtotal:100,priced_cost:75,recovered_cents:240,modelled_freight_cents:4213,suggestion_lines:1,upsell_lines:2,suggestions_offered:3};
const metrics=teamMetricRows([{id:'mara',name:'Mara Jensen',team:'Inside Sales',active:true},{id:'eli',name:'=Eli Porter',team:null,active:true}],[fact],
  [{quote_id:'q1',kind:'sent',at:'2026-10-01T02:00:00.000Z'},{quote_id:'q1',kind:'accepted',at:'2026-10-02T02:00:00.000Z'}],{now:NOW,thresholds:AGING_DEFAULTS});
const lines=teamMetricsCsv(metrics).slice(CSV_BOM.length).split('\r\n');
const cells=(line:string)=>line.split(',');

describe('teamMetricsCsv',()=>{
  it('starts with the BOM and a header naming every metric with its unit',()=>{
    expect(teamMetricsCsv(metrics).startsWith(CSV_BOM)).toBe(true);
    expect(cells(lines[0])).toEqual([...TEAM_CSV_COLUMNS]);
    expect(TEAM_CSV_COLUMNS).toEqual([
      'Rep','Team','Created',
      'Draft ready','Changes requested','Sent','Accepted','Declined','Expired','Open','Open ok','Open aging (amber)','Open overdue (red)',
      'Quote-to-order rate (%)','Unaccepted rate (%)','Decided win rate (%)',
      'Time to send (h)','Customer response time (h)','Time in draft ready (h)','Time in sent (h)','Time in changes requested (h)',
      'Total quoted value ($)','Accepted value ($)','Average quoted margin (%)','Freight recovered ($)','Modelled freight cost ($)',
      'Declined: Price too high','Declined: Found other source','Declined: Need it sooner than quoted','Declined: Wrong items or quantity','Declined: Other','Declined: No reason given',
      'Suggestions offered','Suggestions added','Suggestion acceptance rate (%)','Rep upsell lines',
      'Untouched: Draft never opened','Untouched: Draft opened but never sent','Untouched: Changes requested but never revised',
      'Untouched: Sent but never opened','Untouched: Sent and opened but no reply','Untouched: Expired with no response',
    ]);
  });

  it('has one line per rep, then the totals, then nothing',()=>{
    expect(lines.length).toBe(5);
    expect(lines[4]).toBe('');
    expect(cells(lines[1]).slice(0,3)).toEqual(['Mara Jensen','Inside Sales','1']);
    // A name a spreadsheet would run as a formula is guarded; an empty rate or team is an empty cell.
    expect(cells(lines[2]).slice(0,3)).toEqual(["'=Eli Porter",'','0']);
    expect(cells(lines[3]).slice(0,3)).toEqual(['Total','','1']);
  });

  it('writes rates and margins as percentages, hours to one decimal and money in dollars',()=>{
    const mara=Object.fromEntries(TEAM_CSV_COLUMNS.map((c,i)=>[c,cells(lines[1])[i]]));
    expect(mara).toMatchObject({'Accepted':'1','Quote-to-order rate (%)':'100','Unaccepted rate (%)':'0','Decided win rate (%)':'100',
      'Time to send (h)':'2','Customer response time (h)':'24','Time in sent (h)':'24','Time in changes requested (h)':'',
      'Total quoted value ($)':'1234.50','Accepted value ($)':'1234.50','Average quoted margin (%)':'25','Freight recovered ($)':'2.40','Modelled freight cost ($)':'42.13',
      'Suggestions offered':'3','Suggestions added':'1','Suggestion acceptance rate (%)':'33.3','Rep upsell lines':'2'});
    const eli=Object.fromEntries(TEAM_CSV_COLUMNS.map((c,i)=>[c,cells(lines[2])[i]]));
    expect(eli).toMatchObject({'Quote-to-order rate (%)':'','Average quoted margin (%)':'','Total quoted value ($)':'0.00'});
  });
});
