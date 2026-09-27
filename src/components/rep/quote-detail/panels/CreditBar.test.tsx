import {render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {creditBar} from '@/server/rep/quote-panels-math';
import {CreditBar} from './CreditBar';

// The credit bar (spec §4, task 3.4): green for the open balance, grey from where it ends for
// this quote, and over the limit a red end with "Over limit by $X" (a warning only).

const segment=(name:'open'|'quote'|'over')=>screen.getByTestId('credit-bar').querySelector(`[data-segment="${name}"]`) as HTMLElement|null;
function renderBar(limit:number,open:number,total:number){
  return render(<CreditBar bar={creditBar(limit,open,total)!} openBalance={open} quoteTotal={total} limit={limit}/>);
}

describe('CreditBar',()=>{
  it('labels credit used with this quote, and sizes the green and grey segments from the maths',()=>{
    renderBar(50000,18420,1122.4);
    const bar=screen.getByTestId('credit-bar');
    expect(bar.querySelector('p')).toHaveTextContent('Credit used, with this quote: 39%');
    expect(segment('open')!.style.width).toBe('36.84%');
    expect(segment('quote')!.style.width).toBe('2.24%');
    // The grey segment extends from the green one: it follows it in the bar.
    expect(segment('open')!.nextElementSibling).toBe(segment('quote'));
    expect(segment('over')).toBeNull();
    expect(bar).not.toHaveAttribute('data-over');
    expect(screen.queryByText(/Over limit/)).toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName('Open balance $18,420.00 is 37% of the $50,000.00 credit limit. This quote adds $1,122.40: 39% with it.');
    expect(bar).toHaveTextContent('Open balance $18,420.00This quote $1,122.40');
  });

  it('over the limit: the grey stops at 100%, the end turns red, and it says by how much',()=>{
    renderBar(20000,18420,1856.75);
    const bar=screen.getByTestId('credit-bar');
    expect(bar).toHaveAttribute('data-over','true');
    expect(bar.querySelector('p')).toHaveTextContent('Credit used, with this quote: 101%');
    expect(segment('open')!.style.width).toBe('92.1%');
    expect(segment('quote')!.style.width).toBe('7.9%');
    expect(segment('over')).not.toBeNull();
    expect(screen.getByText('Over limit by $276.75')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('Open balance $18,420.00 is 92% of the $20,000.00 credit limit. This quote adds $1,856.75: 101% with it. Over limit by $276.75.');
  });

  it('with the open balance alone over the limit, green fills the bar and there is no grey left',()=>{
    renderBar(10000,18420,100);
    expect(segment('open')!.style.width).toBe('100%');
    expect(segment('quote')!.style.width).toBe('0%');
    expect(screen.getByText('Over limit by $8,520.00')).toBeInTheDocument();
  });
});
