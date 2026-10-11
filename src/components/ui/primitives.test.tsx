import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {useState} from 'react';
import {describe,expect,it,vi} from 'vitest';
import {Dropdown,DropdownItem} from './Dropdown';
import {HeaderIconButton} from './HeaderIconButton';
import {Lane,LaneRow} from './Lane';
import {PageHeader} from './PageHeader';
import {Popover} from './Popover';
import {Select} from './Select';
import {Sheet} from './Sheet';
import {StatusText} from './StatusText';
import {Toggle} from './Toggle';
import {ViewNoteButton} from './ViewNoteButton';

// The small primitives (plan U0). Frames: C_S4 and C_RS4 (toggle), C_QOTable (status, View note),
// C_QOB5 (sheet), C_QOB3 and C_QOB4 (dropdowns), C_QOBoard (page header, lanes), C_QOB8 (lane reorder).

describe('Toggle',()=>{
  it('is a switch that reports the new state',()=>{
    const onChange=vi.fn();
    const {rerender}=render(<Toggle label="Email me when a quote is accepted" checked={false} onChange={onChange}/>);
    const toggle=screen.getByRole('switch',{name:'Email me when a quote is accepted'});
    expect(toggle).toHaveAttribute('aria-checked','false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Toggle label="Email me when a quote is accepted" checked onChange={onChange}/>);
    expect(toggle).toHaveAttribute('aria-checked','true');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('does nothing while disabled',()=>{
    const onChange=vi.fn();
    render(<Toggle label="Recovery pool" checked disabled onChange={onChange}/>);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('StatusText and ViewNoteButton',()=>{
  it('shows the status as plain text, with at most one problem line under it',()=>{
    const {container,rerender}=render(<StatusText status="Changes requested" flag="Overdue"/>);
    expect(container).toHaveTextContent('Changes requestedOverdue');
    rerender(<StatusText status="Sent"/>);
    expect(container.textContent).toBe('Sent');
  });

  it('is a "View note" button that calls back',()=>{
    const onClick=vi.fn();
    render(<ViewNoteButton onClick={onClick}/>);
    fireEvent.click(screen.getByRole('button',{name:'View note'}));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('PageHeader',()=>{
  it('puts the title first, then the page controls, then the right-hand buttons',()=>{
    render(<PageHeader title="Quotes" right={<HeaderIconButton tone="bell" label="Notifications" icon="bell"/>}>
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
});

describe('Dropdown',()=>{
  it('opens a short list under its button without navigating, and closes on Escape',()=>{
    const onOpenChange=vi.fn();
    function Harness(){
      const [open,setOpen]=useState(false);
      return <Dropdown open={open} onOpenChange={o=>{onOpenChange(o);setOpen(o);}} title="3 need your attention"
        trigger={<HeaderIconButton tone="caution" icon="caution" label="Needs attention, 3 items" open={open}/>}>
        <DropdownItem title="Q-24790" tag="Overdue" tone="problem" onSelect={vi.fn()}>Asked to move pickup.</DropdownItem>
      </Dropdown>;
    }
    render(<Harness/>);
    const button=screen.getByRole('button',{name:'Needs attention, 3 items'});
    expect(button).toHaveAttribute('aria-expanded','false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded','true');
    const panel=screen.getByRole('dialog',{name:'3 need your attention'});
    expect(panel).toHaveTextContent('3 need your attentionQ-24790OverdueAsked to move pickup.');
    expect(within(panel).queryAllByRole('link')).toEqual([]);
    fireEvent.keyDown(panel,{key:'Escape'});
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
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

describe('Lane',()=>{
  it('shows its handle, label and count, and moves with Alt+Left and Alt+Right',()=>{
    const onMove=vi.fn();
    render(<LaneRow ids={['draft','sent','accepted']} onMove={onMove} label="Board columns">
      {lane=><Lane {...lane} key={lane.id} label={lane.id} count={2}><p>cards</p></Lane>}
    </LaneRow>);
    const sent=screen.getByRole('group',{name:'sent'});
    expect(sent).toHaveTextContent(':: sent2cards');
    const handle=sent.querySelector('[draggable="true"]')!;
    expect(handle).toHaveAttribute('tabindex','0');
    act(()=>{fireEvent.keyDown(handle,{key:'ArrowRight',altKey:true});});
    expect(onMove).toHaveBeenCalledWith(1,2);
  });
});
