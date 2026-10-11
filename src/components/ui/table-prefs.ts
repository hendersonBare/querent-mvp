// Column order and visibility for a DataTable (plan U0): pure helpers shared by the table and its
// columns picker, plus the call that saves a user's prefs (PUT /api/rep/table-prefs).

export interface TablePrefs {column_order:string[];hidden_columns:string[]}
export interface PrefColumn {id:string;alwaysShown?:boolean;hiddenByDefault?:boolean}

/** The table's own default: every column in order, the hidden-by-default ones hidden. */
export function defaultPrefs(columns:readonly PrefColumn[]):TablePrefs{
  return {column_order:columns.map(c=>c.id),hidden_columns:columns.filter(c=>c.hiddenByDefault&&!c.alwaysShown).map(c=>c.id)};
}

/**
 * The order and hidden columns to draw, from the user's saved prefs (or the defaults). Ids the table no
 * longer has are dropped. A column the prefs don't know yet goes right after the column it follows by
 * default, with its default visibility. An always-shown column is never hidden.
 */
export function resolveColumns(columns:readonly PrefColumn[],prefs:TablePrefs|null):{order:string[];hidden:string[]}{
  const known=new Map(columns.map(c=>[c.id,c]));
  if(!prefs){const d=defaultPrefs(columns);return {order:d.column_order,hidden:d.hidden_columns};}
  const order=prefs.column_order.filter((id,i,all)=>known.has(id)&&all.indexOf(id)===i);
  const added=new Set<string>();
  columns.forEach((column,i)=>{
    if(order.includes(column.id))return;
    const before=i===0?-1:order.indexOf(columns[i-1].id);
    order.splice(before+1,0,column.id);
    added.add(column.id);
  });
  const hidden=new Set(prefs.hidden_columns);
  return {order,hidden:order.filter(id=>{
    const column=known.get(id)!;
    if(column.alwaysShown)return false;
    return added.has(id)?!!column.hiddenByDefault:hidden.has(id);
  })};
}

/** A copy of `list` with the item at `from` moved to `to` (unchanged when either is out of range). */
export function moveItem<T>(list:readonly T[],from:number,to:number):T[]{
  const next=[...list];
  if(from<0||from>=list.length||to<0||to>=list.length||from===to)return next;
  const [item]=next.splice(from,1);
  next.splice(to,0,item);
  return next;
}

/** Saves the signed-in user's prefs for a table. Failures are ignored: the table keeps working as it is. */
export async function saveTablePrefs(tableId:string,prefs:TablePrefs){
  try{
    await fetch('/api/rep/table-prefs',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({table_id:tableId,...prefs})});
  }catch{/* offline or signed out: nothing to show (no frame for a save error) */}
}
