import {describe,expect,it} from 'vitest';
import {defaultPrefs,moveItem,resolveColumns} from './table-prefs';

// Column order and visibility (plan U0): a user's saved prefs win; columns the table gained since are
// added where they sit by default; columns it lost are dropped; an always-shown column never hides.

const COLUMNS=[{id:'quote',alwaysShown:true},{id:'customer'},{id:'requested'},{id:'status'},{id:'rep',hiddenByDefault:true},{id:'margin'}];

describe('table prefs',()=>{
  it('defaults to the columns in order, with the hidden-by-default ones hidden',()=>{
    expect(defaultPrefs(COLUMNS)).toEqual({column_order:['quote','customer','requested','status','rep','margin'],hidden_columns:['rep']});
    expect(resolveColumns(COLUMNS,null)).toEqual({order:['quote','customer','requested','status','rep','margin'],hidden:['rep']});
  });

  it('applies saved prefs, drops unknown ids, inserts new columns after their default neighbour, keeps a new column\'s default visibility, never hides an always-shown one',()=>{
    const prefs={column_order:['status','quote','gone','customer','requested'],hidden_columns:['quote','customer','gone']};
    expect(resolveColumns(COLUMNS,prefs)).toEqual({order:['status','rep','margin','quote','customer','requested'],hidden:['rep','customer']});
    expect(resolveColumns(COLUMNS,{column_order:['margin','customer'],hidden_columns:[]}))
      .toEqual({order:['quote','margin','customer','requested','status','rep'],hidden:['rep']});
  });

  it('moves an item to a new index',()=>{
    expect(moveItem(['a','b','c','d'],3,1)).toEqual(['a','d','b','c']);
    expect(moveItem(['a','b','c','d'],0,2)).toEqual(['b','c','a','d']);
    expect(moveItem(['a','b'],0,0)).toEqual(['a','b']);
    expect(moveItem(['a','b'],1,5)).toEqual(['a','b']);
  });
});
