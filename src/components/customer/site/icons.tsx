import type {SVGProps} from 'react';

// The customer site frames' line icons (C_CVE0 to C_CVL5): a 24px grid, stroke 2, round caps and
// joins, drawn at the size each frame uses. Each is hidden from assistive tech: its control carries the name.

const PATHS={
  send:['M21 3 10 14','M21 3 14 21l-4-7-7-4 18-7z'],
  orders:['M3 8l9-5 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9'],
  rep:['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c1-4 4-6 8-6s7 2 8 6'],
  close:['M6 6l12 12M18 6 6 18'],
  chevron:['M6 9l6 6 6-6'],
  phone:['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  download:['M12 4v11M7 11l5 5 5-5M5 20h14'],
  zoomIn:['m20 20-4-4M11 8v6M8 11h6'],
  zoomOut:['m20 20-4-4M8 11h6'],
} as const;
export type SiteIconName=keyof typeof PATHS|'mail';

export function SiteIcon({name,size,stroke='currentColor',...rest}:{name:SiteIconName;size:number;stroke?:string}&Omit<SVGProps<SVGSVGElement>,'name'|'stroke'>){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {name==='mail'?<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>
      :name==='zoomIn'||name==='zoomOut'?<><circle cx="11" cy="11" r="6"/>{PATHS[name].map(d=><path key={d} d={d}/>)}</>
      :PATHS[name].map(d=><path key={d} d={d}/>)}
  </svg>;
}

/** The Querent mark above the box's heading (C_CVE0, C_CVL1): 52px, accent stroke. */
export function QuerentMark(){
  return <svg width="52" height="52" viewBox="10 10 80 80" fill="none" stroke="#14803C" strokeWidth="7.5" strokeLinecap="round" role="img" aria-label="Querent">
    <circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/>
  </svg>;
}
