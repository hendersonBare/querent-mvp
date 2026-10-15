// The rail's sections (docs/boxt/plan.md, product rule 2): exactly these three, in this order, each
// with a 24px line icon path. Nothing else in the app is reachable from the rail.

export const ORG_NAME='BOXT Packaging';

export const SECTIONS=[
  {id:'quote-tool',label:'Quote creation tool',href:'/quote-tool',icon:'M4 6h10 M4 12h7 M4 18h5 M14 16l2.5 2.5L21 14'},
  {id:'quotes',label:'Quotes',href:'/quotes',icon:'M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5'},
  {id:'settings',label:'Settings',href:'/settings',icon:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2'},
] as const;
export type Section=typeof SECTIONS[number];

/** The section a path belongs to: /quotes and /quotes/3f2a are both Quotes. */
export const sectionFor=(pathname:string):Section|undefined=>SECTIONS.find(s=>pathname===s.href||pathname.startsWith(`${s.href}/`));
