import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from './test-db';

// Per-user table column prefs (plan U0, migration 009): column order and hidden columns, stored per
// (user, table). A user with no row gets null, so the table shows its default columns.
useSeededDatabase();

describe('table prefs repository',()=>{
  it('returns null before anything is saved',async()=>{
    const {tablePrefs}=await import('./table-prefs');
    expect(tablePrefs('mara','quotes')).toBeNull();
  });

  it('saves and reads back the order and hidden columns, per user and per table',async()=>{
    const {saveTablePrefs,tablePrefs}=await import('./table-prefs');
    expect(saveTablePrefs('mara','quotes',{column_order:['customer','quote','status'],hidden_columns:['margin']}))
      .toEqual({column_order:['customer','quote','status'],hidden_columns:['margin']});
    saveTablePrefs('mara','customers',{column_order:['rep','customer'],hidden_columns:[]});
    saveTablePrefs('eli','quotes',{column_order:['quote'],hidden_columns:['customer']});
    expect(tablePrefs('mara','quotes')).toEqual({column_order:['customer','quote','status'],hidden_columns:['margin']});
    expect(tablePrefs('mara','customers')).toEqual({column_order:['rep','customer'],hidden_columns:[]});
    expect(tablePrefs('eli','quotes')).toEqual({column_order:['quote'],hidden_columns:['customer']});
    expect(tablePrefs('brandi','quotes')).toBeNull();
  });

  it('replaces a saved row rather than adding one',async()=>{
    const {saveTablePrefs,tablePrefs}=await import('./table-prefs');
    saveTablePrefs('mara','quotes',{column_order:['status','quote'],hidden_columns:[]});
    expect(tablePrefs('mara','quotes')).toEqual({column_order:['status','quote'],hidden_columns:[]});
    expect(tablePrefs('eli','quotes')).toEqual({column_order:['quote'],hidden_columns:['customer']});
  });
});
