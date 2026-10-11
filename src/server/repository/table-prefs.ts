import 'server-only';
import {one,run} from './sql';

// Per-user table column prefs for the new UI (plan U0, migration 009_ui_table_prefs): the column
// order and the hidden columns of one table for one user. Callers pass the signed-in user's id, never
// one taken from a request.

export interface TablePrefs {column_order:string[];hidden_columns:string[]}

/** The user's saved prefs for the table, or null when they have none (the table shows its defaults). */
export function tablePrefs(userId:string,tableId:string):TablePrefs|null{
  const row=one<{column_order:string;hidden_columns:string}>('SELECT column_order,hidden_columns FROM ui_table_prefs WHERE user_id=? AND table_id=?',userId,tableId);
  return row?{column_order:JSON.parse(row.column_order) as string[],hidden_columns:JSON.parse(row.hidden_columns) as string[]}:null;
}

/** Saves (replaces) the user's prefs for the table and returns them. */
export function saveTablePrefs(userId:string,tableId:string,prefs:TablePrefs):TablePrefs{
  run(`INSERT INTO ui_table_prefs(user_id,table_id,column_order,hidden_columns) VALUES(?,?,?,?)
    ON CONFLICT(user_id,table_id) DO UPDATE SET column_order=excluded.column_order,hidden_columns=excluded.hidden_columns`,
  userId,tableId,JSON.stringify(prefs.column_order),JSON.stringify(prefs.hidden_columns));
  return {column_order:[...prefs.column_order],hidden_columns:[...prefs.hidden_columns]};
}
