import type {SVGProps} from 'react';

// The frames' line icons (24px grid, round caps), drawn at the size each frame uses.
const PATHS={
  filter:['M3 5h18l-7 8v6l-4-2v-4L3 5z'],
  search:[],
  columns:['M4 5h16v14H4z M9.5 5v14 M14.5 5v14'],
  caution:['M12 3 2 20h20L12 3z','M12 10v4M12 17.5v.01'],
  bell:['M6 17v-6a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z','M10 21a2 2 0 0 0 4 0'],
  download:['M12 4v11 M7 10l5 5 5-5 M5 20h14'],
  message:['M4 5h16v11H9l-5 4z'],
  clock:['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 8v4l3 2'],
} as const;
export type IconName=keyof typeof PATHS;

const LINEJOIN:Partial<Record<IconName,'round'>>={filter:'round',columns:'round',caution:'round',bell:'round',download:'round',message:'round',clock:'round'};
const LINECAP:Partial<Record<IconName,'round'>>={columns:'round',caution:'round',bell:'round',search:'round',download:'round',message:'round',clock:'round'};

/** An icon from the frames, hidden from assistive tech (its control carries the name). */
export function Icon({name,size,stroke='currentColor',...rest}:{name:IconName;size:number;stroke?:string}&Omit<SVGProps<SVGSVGElement>,'name'|'stroke'>){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap={LINECAP[name]} strokeLinejoin={LINEJOIN[name]} aria-hidden="true" {...rest}>
    {name==='search'?<><circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/></>:PATHS[name].map(d=><path key={d} d={d}/>)}
  </svg>;
}
