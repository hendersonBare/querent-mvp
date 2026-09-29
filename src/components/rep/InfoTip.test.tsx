import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {InfoTip} from './InfoTip';

// The "i" tooltip (task 6.2). Page-level behaviour, including real Tab presses below the fold,
// is in e2e/rep-analytics.spec.ts.

const renderTip=()=>render(<InfoTip topic="win rate">Accepted quotes divided by decided quotes.</InfoTip>);
const button=()=>screen.getByRole('button',{name:'How win rate is calculated'});

describe('InfoTip',()=>{
  it('describes its button even while closed, and opens on focus, click or hover',()=>{
    renderTip();
    expect(button()).toHaveAccessibleDescription('Accepted quotes divided by decided quotes.');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(button());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Accepted quotes divided by decided quotes.');
    fireEvent.blur(button());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(button());
    expect(screen.getByRole('tooltip')).toBeVisible();
    fireEvent.mouseLeave(button().parentElement!);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(button().parentElement!);
    expect(screen.getByRole('tooltip')).toBeVisible();
  });

  it('stays open when the page scrolls or resizes (focus scrolls an off-screen "i" into view), and closes on Escape',()=>{
    renderTip();
    fireEvent.focus(button());
    fireEvent.scroll(window);
    fireEvent.scroll(document);
    fireEvent(window,new Event('resize'));
    expect(screen.getByRole('tooltip')).toBeVisible();
    fireEvent.keyDown(window,{key:'Escape'});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('is at most 300px wide, and narrower on a small screen, with a 16px gutter',()=>{
    renderTip();
    fireEvent.focus(button());
    expect(screen.getByRole('tooltip').style.width).toBe('300px');
    fireEvent.blur(button());
    Object.defineProperty(document.documentElement,'clientWidth',{configurable:true,value:320});
    try{
      fireEvent.focus(button());
      const tip=screen.getByRole('tooltip');
      const left=parseFloat(tip.style.left),tipWidth=parseFloat(tip.style.width);
      expect(tipWidth).toBe(320-32);
      expect(left).toBeGreaterThanOrEqual(16);
      expect(left+tipWidth).toBeLessThanOrEqual(320-16);
    }finally{
      Reflect.deleteProperty(document.documentElement,'clientWidth'); // back to jsdom's own getter
    }
  });
});
