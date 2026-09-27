// Number formats for the Analytics page (task 6.2). Pure, so they are unit tested.

const CENTS=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const DOLLARS=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const COUNT=new Intl.NumberFormat('en-US');

/** "35 min", "1 h 33 min", "2.3 days"; "—" for none. */
export function formatDuration(minutes:number|null):string{
  if(minutes===null)return '—';
  if(minutes<0.5)return '<1 min';
  const whole=Math.round(minutes);
  if(whole<60)return `${whole} min`;
  if(whole<1440){const h=Math.floor(whole/60),m=whole%60;return m?`${h} h ${m} min`:`${h} h`;}
  return `${(minutes/1440).toFixed(1)} days`;
}

/** "71%"; "—" when there is no rate (nothing to divide by). */
export const formatPercent=(rate:number|null)=>rate===null?'—':`${Math.round(rate*100)}%`;

/** A dollar figure for a stat card: to the cent under $1,000 ("$10.20"), whole dollars above ("$9,045"). */
export const formatMoneyFigure=(amount:number)=>Math.abs(amount)<999.995?CENTS.format(amount):DOLLARS.format(amount);
/** Dollars to the cent: "$9,045.35". */
export const formatMoney=(amount:number)=>CENTS.format(amount);
/** GP Querent found: "+$10.20", or "$0.00" with none. */
export const formatGpAmount=(amount:number)=>amount>0?`+${formatMoneyFigure(amount)}`:formatMoneyFigure(amount);

/** "8.0" (hours, one decimal). */
export const formatHours=(hours:number)=>hours.toFixed(1);
/** "1,234" */
export const formatCount=(n:number)=>COUNT.format(n);
/** "Sep 21" for a YYYY-MM-DD week start. */
export const formatWeek=(day:string)=>new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
/** "1 quote", "24 quotes". */
export const plural=(n:number,word:string,many=`${word}s`)=>`${formatCount(n)} ${n===1?word:many}`;

/** Whole-number ticks from 0 that cover `max`, about four or five of them: 0,1,2 / 0,2,4,6,8 / 0,5,...,20. */
export function niceTicks(max:number):number[]{
  const top=Math.max(1,Math.ceil(max));
  const step=top<=5?1:[1,2,5,10,20,25,50,100].find(s=>top/s<=4)??Math.ceil(top/4);
  const end=Math.ceil(top/step)*step;
  return Array.from({length:end/step+1},(_,i)=>i*step);
}
