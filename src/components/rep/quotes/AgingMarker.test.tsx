import {render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {AgingMarker} from './AgingMarker';

// The aging marker (v3 spec §3, decision 18): amber = clock icon + "Aging", red = alert icon +
// "Overdue", text and icon as well as colour, the reason as the tooltip and for screen readers.

describe('AgingMarker',()=>{
  it('amber: a clock icon and "Aging"',()=>{
    const {container}=render(<AgingMarker aging={{level:'amber',since:'2026-10-06T09:00:00.000Z',reason:'Sent 4 days ago'}}/>);
    const marker=container.querySelector('[data-level="amber"]')!;
    expect(marker).toHaveTextContent('Aging');
    expect(marker).toHaveAttribute('title','Sent 4 days ago');
    expect(marker.querySelector('svg')).toHaveClass('lucide-clock');
    expect(marker.querySelector('svg')).toHaveAttribute('aria-hidden','true');
    expect(screen.getByText(': Sent 4 days ago')).toBeInTheDocument();
  });

  it('red: an alert icon and "Overdue"',()=>{
    const {container}=render(<AgingMarker aging={{level:'red',since:'2026-10-06T09:00:00.000Z',reason:'Expires today'}}/>);
    const marker=container.querySelector('[data-level="red"]')!;
    expect(marker).toHaveTextContent(/^Overdue/);
    expect(marker).toHaveAttribute('title','Expires today');
    expect(marker.querySelector('svg')).toHaveClass('lucide-triangle-alert');
  });

  it('nothing for a quote that is fine or final',()=>{
    expect(render(<AgingMarker aging={{level:'ok',since:'2026-10-06T09:00:00.000Z',reason:'Sent 1 hour ago'}}/>).container).toBeEmptyDOMElement();
    expect(render(<AgingMarker aging={null}/>).container).toBeEmptyDOMElement();
  });
});
