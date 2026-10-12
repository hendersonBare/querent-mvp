// The quote editor's icons, drawn as the frames draw them (C_QEBase, C_QE4, C_QE8, C_QE11): 24-unit
// strokes in the current colour, round caps and joins.

const STROKE={fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round'} as const;

function Icon({d,size=20,width=2}:{d:string;size?:number;width?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={width} aria-hidden="true" {...STROKE}><path d={d}/></svg>;
}

export const SaveIcon=()=><Icon d="M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6"/>;
export const ExportIcon=()=><Icon d="M12 4v11 M7 10l5 5 5-5 M5 20h14"/>;
export const ChatIcon=()=><Icon d="M4 5h16v11H9l-5 4z"/>;
export const MoreIcon=()=><Icon d="M5 12h.01 M12 12h.01 M19 12h.01"/>;
/** Quote details' chevron: down while closed, up while open. */
export const Chevron=({open}:{open:boolean})=><Icon d={open?'m6 15 6-6 6 6':'m6 9 6 6 6-6'} size={14} width={2.4}/>;
export const CheckIcon=()=><Icon d="m5 12 5 5 9-10" width={2.4}/>;
