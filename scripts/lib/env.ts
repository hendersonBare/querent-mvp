import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

// Small env helpers for the scripts (no dotenv dependency). Values are never printed: callers log
// key names and counts only.

/** Parses KEY=value lines (optional `export `, '#' comments, single or double quotes). */
export function parseDotenv(text:string):Record<string,string>{
  const out:Record<string,string>={};
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const m=/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if(!m)continue;
    let value=m[2].trim();
    const quote=value[0];
    if((quote==='"'||quote==="'")&&value.endsWith(quote)&&value.length>=2)value=value.slice(1,-1);
    else value=value.replace(/\s+#.*$/,'');
    out[m[1]]=value;
  }
  return out;
}

/**
 * Loads `.env.local` from `root` into process.env without overriding anything already set in the
 * shell (the shell wins, as with Next.js). Returns the names of the keys it set.
 */
export function loadEnvLocal(root:string):string[]{
  const file=join(root,'.env.local');
  if(!existsSync(file))return [];
  const loaded:string[]=[];
  for(const [key,value] of Object.entries(parseDotenv(readFileSync(file,'utf8')))){
    if(process.env[key]===undefined){process.env[key]=value;loaded.push(key);}
  }
  return loaded;
}

const LOCAL_HOSTS=new Set(['127.0.0.1','localhost','::1','[::1]','0.0.0.0']);

/** True when `url` (http or postgres) points at this machine. */
export function isLocalUrl(url:string|undefined|null):boolean{
  if(!url)return false;
  try{return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());}catch{return false;}
}

/**
 * Rewrites an env file: each key in `values` gets exactly one `KEY=value` line (replacing any it had,
 * in place, or appended at the end); every other line, comments and ANTHROPIC_* keys included, is kept.
 */
export function mergeEnvFile(existing:string,values:Record<string,string>):string{
  const pending=new Map(Object.entries(values));
  const lines=existing===''?[]:existing.replace(/\r?\n$/,'').split(/\r?\n/);
  const out:string[]=[];
  for(const line of lines){
    const m=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if(m&&values[m[1]]!==undefined){
      if(pending.has(m[1])){out.push(`${m[1]}=${values[m[1]]}`);pending.delete(m[1]);}
      continue;
    }
    out.push(line);
  }
  for(const [key,value] of pending)out.push(`${key}=${value}`);
  return `${out.join('\n')}\n`;
}
