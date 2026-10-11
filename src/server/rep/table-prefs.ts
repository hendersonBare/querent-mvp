import 'server-only';
import {z} from 'zod';
import {saveTablePrefs,tablePrefs,type TablePrefs} from '@/server/repository/table-prefs';

// Per-user table column prefs (plan U0): GET/PUT /api/rep/table-prefs. The user is always the signed-in
// one (the route passes the session's id); a body naming anyone else is refused, not obeyed.

export class TablePrefsError extends Error {}

const ID=/^[a-z][a-z0-9_-]{0,39}$/;
const MAX_COLUMNS=40;
const TableId=z.string({error:'Name the table: table_id.'}).regex(ID,{error:'table_id must be a table id like "quotes".'});
const Columns=(field:string)=>z.array(z.string().regex(ID,{error:`${field} must list column ids like "customer".`}),{error:`${field} must be a list of column ids.`})
  .max(MAX_COLUMNS,{error:`${field} can list at most ${MAX_COLUMNS} columns.`})
  .refine(ids=>new Set(ids).size===ids.length,{error:`${field} lists a column twice.`});
const Body=z.strictObject({table_id:TableId,column_order:Columns('column_order'),hidden_columns:Columns('hidden_columns')},
  {error:issue=>issue.code==='unrecognized_keys'?`Unknown field: ${issue.keys.join(', ')}.`:undefined});

export interface TablePrefsAnswer {table_id:string;prefs:TablePrefs|null}

/** The table id from ?table=, checked. */
export function readTablePrefs(userId:string,table:string|null):TablePrefsAnswer{
  const parsed=TableId.safeParse(table??undefined);
  if(!parsed.success)throw new TablePrefsError(parsed.error.issues[0]?.message??'Name the table.');
  return {table_id:parsed.data,prefs:tablePrefs(userId,parsed.data)};
}

/** Saves the body's prefs for the signed-in user. */
export function writeTablePrefs(userId:string,body:unknown):TablePrefsAnswer{
  const parsed=Body.safeParse(body);
  if(!parsed.success)throw new TablePrefsError(parsed.error.issues[0]?.message??'Check the request.');
  const {table_id,column_order,hidden_columns}=parsed.data;
  return {table_id,prefs:saveTablePrefs(userId,table_id,{column_order,hidden_columns})};
}
