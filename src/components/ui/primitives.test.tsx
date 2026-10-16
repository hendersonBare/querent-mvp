import {fireEvent,render,screen,within} from '@testing-library/react';
import {useState} from 'react';
import {describe,expect,it,vi} from 'vitest';
import {PageHeader} from './PageHeader';
import {Popover} from './Popover';
import {Select} from './Select';
import {Sheet} from './Sheet';

// The small primitives (plan U0): page header, popover, sheet, select, and their focus handling.

describe('PageHeader',()=>{
  it('puts the title first, then the page controls, then the right-hand buttons',()=>{
    render(<PageHeader title="Quotes" right={<button aria-label="Notifications"/>}>
      <span>picker</span><span>filter</span>
    </PageHeader>);
    const header=screen.getByRole('banner');
    expect(within(header).getByRole('heading',{level:1,name:'Quotes'})).toBeInTheDocument();
    expect(header).toHaveTextContent(/^Quotespickerfilter$/);
    expect(within(header).getByRole('button',{name:'Notifications'})).toBeInTheDocument();
  });
});

describe('Popover',()=>{
  function Harness({onClose=vi.fn()}:{onClose?:()=>void}){
    return <div><button>outside</button><Popover open label="Choose columns" onClose={onClose}><button>inside</button></Popover></div>;
  }
  it('is labelled, closes on Escape and on a press outside, not inside',()=>{
    const onClose=vi.fn();
    render(<Harness onClose={onClose}/>);
    const dialog=screen.getByRole('dialog',{name:'Choose columns'});
    fireEvent.mouseDown(within(dialog).getByRole('button',{name:'inside'}));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('button',{name:'outside'}));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog,{key:'Escape'});
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // In the app React's root is the document, so a row picked inside the panel (a Select option) is gone
  // from the page before the panel hears the press (plan U3).
  it('stays open for a press inside on a row the press removes',()=>{
    const onClose=vi.fn();
    render(<Harness onClose={onClose}/>);
    const inside=within(screen.getByRole('dialog')).getByRole('button',{name:'inside'});
    const remove=()=>inside.remove();
    document.addEventListener('mousedown',remove,true);
    fireEvent.mouseDown(inside);
    document.removeEventListener('mousedown',remove,true);
    expect(inside.isConnected).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Sheet',()=>{
  it('is a modal dialog with a title and a close button; Escape and the backdrop close it',()=>{
    const onClose=vi.fn();
    render(<Sheet open title="Q-24790" subtitle="Wasatch Mechanical Contractors" onClose={onClose}><p>body</p></Sheet>);
    const sheet=screen.getByRole('dialog',{name:'Q-24790'});
    expect(sheet).toHaveAttribute('aria-modal','true');
    expect(sheet).toHaveTextContent('Wasatch Mechanical Contractors');
    fireEvent.click(within(sheet).getByRole('button',{name:'Close'}));
    fireEvent.keyDown(sheet,{key:'Escape'});
    fireEvent.mouseDown(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('renders nothing while closed',()=>{
    render(<Sheet open={false} title="Q-24790" onClose={vi.fn()}>body</Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Select',()=>{
  it('opens a list of options and picks one with a click or the keyboard',()=>{
    const onChange=vi.fn();
    render(<Select label="Rep" value="" onChange={onChange} options={[{value:'',label:'All reps'},{value:'mara',label:'Mara Jensen'},{value:'eli',label:'Eli Porter'}]}/>);
    const button=screen.getByRole('button',{name:'Rep: All reps'});
    fireEvent.click(button);
    fireEvent.mouseDown(screen.getByRole('option',{name:'Eli Porter'}));
    expect(onChange).toHaveBeenLastCalledWith('eli');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('listbox'),{key:'ArrowDown'});
    fireEvent.keyDown(screen.getByRole('listbox'),{key:'Enter'});
    expect(onChange).toHaveBeenLastCalledWith('mara');
  });
});

// Appendix H "dropdowns and sheets trap and restore focus" (plan U11): each takes focus when it opens,
// keeps Tab and Shift+Tab inside, and gives focus back to what had it when it closes.
describe('focus: popovers and sheets trap and restore it',()=>{
  function SheetHarness(){
    const [open,setOpen]=useState(false);
    return <><button onClick={()=>setOpen(true)}>Open sheet</button><button>After</button>
      <Sheet open={open} title="Q-24790" onClose={()=>setOpen(false)}><button>Reply</button><button>Open quote</button></Sheet></>;
  }
  it('a sheet takes focus, keeps Tab and Shift+Tab inside, and gives focus back on close',()=>{
    render(<SheetHarness/>);
    const opener=screen.getByRole('button',{name:'Open sheet'});
    opener.focus();
    fireEvent.click(opener);
    const sheet=screen.getByRole('dialog',{name:'Q-24790'});
    expect(document.activeElement).toBe(sheet);
    const [close,,last]=within(sheet).getAllByRole('button');
    last.focus();
    fireEvent.keyDown(last,{key:'Tab'});
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close,{key:'Tab',shiftKey:true});
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(sheet,{key:'Tab',shiftKey:true});
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('a panel inside a panel traps on its own, and the outer one leaves it alone',()=>{
    function Nested(){
      return <Popover open label="Filter" onClose={vi.fn()}><button>Clear all</button>
        <Popover open label="Rep" onClose={vi.fn()}><button>Mara</button><button>Eli</button></Popover>
        <button>Apply filters</button></Popover>;
    }
    render(<Nested/>);
    const inner=screen.getByRole('dialog',{name:'Rep'});
    const [mara,eli]=within(inner).getAllByRole('button');
    eli.focus();
    fireEvent.keyDown(eli,{key:'Tab'});
    expect(document.activeElement).toBe(mara);
  });
});
