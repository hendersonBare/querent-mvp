import {describe,expect,it} from 'vitest';
import {ALL_STATUSES,NO_FILTERS,canonicalQuery,filterCount,filtersFromQuery,fromPanel,parseView,quotesHref,toPanel} from './filters';

// The Quotes page's filters in the URL (plan U3): one query drives the server render, the list's poll
// and the filter panel (C_QOB2). Pure, so the page, the list and the tests share it.

describe('the page query',()=>{
  it('reads every panel field, and nothing else as a filter',()=>{
    expect(filtersFromQuery('status=sent,ready_for_review&rep=mara&customer=wasatch&requested_from=2026-09-01&requested_to=2026-10-10&only=aging,overdue&view=table'))
      .toEqual({statuses:['ready_for_review','sent'],rep:'mara',customer:'wasatch',requestedFrom:'2026-09-01',requestedTo:'2026-10-10',only:['overdue','aging']});
    expect(filtersFromQuery('')).toEqual(NO_FILTERS);
    expect(filtersFromQuery('customer=all&requested_from=Sep+1&status=lost')).toEqual(NO_FILTERS);
  });

  it('turns the old Needs attention and aging links into Only show (the caution dropdown replaced the view, plan U2)',()=>{
    expect(canonicalQuery('attention=1&sort=oldest&customer=wasatch')).toBe('customer=wasatch&only=overdue%2Caging');
    expect(canonicalQuery('aging=red&rep=mara%2Celi&from=2026-09-01T06%3A00%3A00.000Z&to=2026-10-01T06%3A00%3A00.000Z'))
      .toBe('rep=mara%2Celi&from=2026-09-01T06%3A00%3A00.000Z&to=2026-10-01T06%3A00%3A00.000Z&only=overdue');
    expect(canonicalQuery('aging=amber')).toBe('only=aging');
    // The Team dashboard's open-and-on-time drill-down has no panel field: it stays as it is.
    expect(canonicalQuery('aging=ok&status=sent')).toBe('status=sent&aging=ok');
    // The view is not a filter.
    expect(canonicalQuery('view=table&customer=wasatch')).toBe('customer=wasatch');
  });

  it('builds the page link for a view and filters, keeping the drill-down params it was given',()=>{
    expect(quotesHref(NO_FILTERS,'board')).toBe('/rep/quotes');
    expect(quotesHref(NO_FILTERS,'table')).toBe('/rep/quotes?view=table');
    expect(quotesHref({...NO_FILTERS,customer:'wasatch',statuses:['sent'],only:['overdue']},'board')).toBe('/rep/quotes?customer=wasatch&status=sent&only=overdue');
    expect(quotesHref({...NO_FILTERS,rep:'mara',requestedFrom:'2026-09-01'},'table','from=a&to=b&team=Inside+Sales&aging=ok'))
      .toBe('/rep/quotes?view=table&rep=mara&requested_from=2026-09-01&from=a&to=b&team=Inside+Sales&aging=ok');
    // Every status picked is no status filter.
    expect(quotesHref({...NO_FILTERS,statuses:[...ALL_STATUSES]},'board')).toBe('/rep/quotes');
  });

  it('reads the view: board unless it says table',()=>{
    expect(parseView('table')).toBe('table');
    expect(parseView('board')).toBe('board');
    expect(parseView(null)).toBe('board');
    expect(parseView('cards')).toBe('board');
  });
});

describe('the filter panel',()=>{
  it('shows every status ticked when no status is filtered, as C_QOB2 draws it',()=>{
    expect(toPanel(NO_FILTERS).statuses).toEqual(ALL_STATUSES);
    expect(toPanel({...NO_FILTERS,statuses:['sent']}).statuses).toEqual(['sent']);
  });
  it('applies none or all statuses as no status filter',()=>{
    expect(fromPanel({...NO_FILTERS,statuses:[]}).statuses).toEqual([]);
    expect(fromPanel({...NO_FILTERS,statuses:[...ALL_STATUSES]}).statuses).toEqual([]);
    expect(fromPanel({...NO_FILTERS,statuses:['expired','sent']}).statuses).toEqual(['sent','expired']);
  });
  it('counts what is applied: a status choice, rep, customer, each date and each Only show',()=>{
    expect(filterCount(NO_FILTERS)).toBe(0);
    expect(filterCount({...NO_FILTERS,statuses:['sent','accepted']})).toBe(1);
    expect(filterCount({statuses:['sent'],rep:'mara',customer:'wasatch',requestedFrom:'2026-09-01',requestedTo:'2026-10-01',only:['overdue','aging']})).toBe(7);
  });
});
