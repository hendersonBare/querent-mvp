// Copy quote summary's clipboard write (task 4.3). The async Clipboard API first; where it is
// missing (an http:// LAN address is not a secure context) or refused, the older
// execCommand('copy') on a hidden textarea. Call it straight from the click, so the browser still
// counts the write as the user's.

/** Copies `text`. Resolves true once it is on the clipboard, false when the browser refused both ways. */
export async function copyText(text:string):Promise<boolean>{
  if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(text);return true;}catch{/* Refused: try the older way. */}
  }
  return copyWithTextarea(text);
}

/** The pre-Clipboard-API copy: select the text in an offscreen textarea and run the copy command. */
export function copyWithTextarea(text:string):boolean{
  if(typeof document==='undefined'||!document.body)return false;
  const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const area=document.createElement('textarea');
  area.value=text;
  area.setAttribute('readonly','');
  area.setAttribute('aria-hidden','true');
  // In view but invisible: some browsers won't select text that is off screen or display:none.
  Object.assign(area.style,{position:'fixed',top:'0',left:'0',width:'1px',height:'1px',padding:'0',border:'0',opacity:'0',pointerEvents:'none'});
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0,text.length);
  let copied=false;
  try{copied=document.execCommand('copy');}catch{copied=false;}
  area.remove();
  if(focused?.isConnected)focused.focus();
  return copied;
}
