import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import type {ClarifyLine,ClarifyPayload,ItemCandidate} from '@/domain';
import {ClarifyPanel} from './ClarifyPanel';

const wheel=(sku:string,description:string):ItemCandidate=>({sku,description,pack:'Box of 25',category_name:'Abrasives & Cutting'});
const T1=wheel('CW-45-045-T1','Cut-off wheel 4.5 x .045 x 7/8 in, Type 1');
const T27=wheel('CW-45-045-T27','Cut-off wheel 4.5 x .045 x 7/8 in, Type 27');
const T27_090=wheel('CW-45-090-T27','Cut-off wheel 4.5 x .090 x 7/8 in, Type 27');
const BRANDI={name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'};

const line=(round:number,extra:Partial<ClarifyLine>={}):ClarifyLine=>({
  requested_text:'6 boxes of cut-off wheels',qty:6,question:'Type 1 or Type 27 cut-off wheels?',round,text:'cut-off wheels',
  candidates:[T1,T27,T27_090,wheel('CW-6-045-T1','Cut-off wheel 6 x .045 x 7/8 in, Type 1')],
  choices:round>=2?[T1,T27,T27_090]:[],...extra,
});
const payload=(open:ClarifyLine[],rep:ClarifyPayload['rep']=open.some(l=>l.round>=2)?BRANDI:null):ClarifyPayload=>({
  open,cart:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10}]},dropped:[],rep,
});

describe('ClarifyPanel',()=>{
  it('shows nothing in round 1: the question is the whole reply',()=>{
    const {container}=render(<ClarifyPanel payload={payload([line(1)])} active onSend={vi.fn()}/>);
    expect(container).toBeEmptyDOMElement();
  });

  it('from round 2 shows the top 3 candidates as buttons with SKU, description and pack, and never a price',()=>{
    render(<ClarifyPanel payload={payload([line(2)])} active onSend={vi.fn()}/>);
    const group=screen.getByRole('group',{name:'Choose the item for “6 boxes of cut-off wheels”'});
    const buttons=within(group).getAllByRole('button');
    expect(buttons.map(b=>b.textContent)).toEqual([
      'CW-45-045-T1Cut-off wheel 4.5 x .045 x 7/8 in, Type 1Box of 25',
      'CW-45-045-T27Cut-off wheel 4.5 x .045 x 7/8 in, Type 27Box of 25',
      'CW-45-090-T27Cut-off wheel 4.5 x .090 x 7/8 in, Type 27Box of 25',
    ]);
    expect(screen.queryByText('CW-6-045-T1')).not.toBeInTheDocument();
    expect(group.textContent).not.toMatch(/\$|price|cost/i);
  });

  it('sends the pick as a chat message when a candidate is pressed',()=>{
    const onSend=vi.fn();
    render(<ClarifyPanel payload={payload([line(2)])} active onSend={onSend}/>);
    fireEvent.click(screen.getByRole('button',{name:/^Choose CW-45-045-T27\b/}));
    expect(onSend).toHaveBeenCalledWith('CW-45-045-T27 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 27)');
  });

  it('drops the line with Drop this line',()=>{
    const onSend=vi.fn();
    render(<ClarifyPanel payload={payload([line(2)])} active onSend={onSend}/>);
    fireEvent.click(screen.getByRole('button',{name:'Drop this line: 6 boxes of cut-off wheels'}));
    expect(onSend).toHaveBeenCalledWith('Drop “6 boxes of cut-off wheels”');
  });

  it('shows the assigned rep\'s name, phone and email to call instead',()=>{
    render(<ClarifyPanel payload={payload([line(2)])} active onSend={vi.fn()}/>);
    const rep=screen.getByRole('region',{name:'Call your rep'});
    expect(rep).toHaveTextContent('Brandi Gallegos');
    expect(rep).toHaveTextContent('Inside Sales');
    expect(within(rep).getByRole('link',{name:/\(801\) 111-2222/})).toHaveAttribute('href','tel:8011112222');
    expect(within(rep).getByRole('link',{name:'brandi.gallegos@herrickindustrial.com'})).toHaveAttribute('href','mailto:brandi.gallegos@herrickindustrial.com');
  });

  it('shows one group per open line in round 2 or later, and a drop for each of those',()=>{
    const straps=line(1,{requested_text:'2 in ratchet straps',question:'27 ft or 30 ft ratchet straps?',candidates:[],choices:[]});
    render(<ClarifyPanel payload={payload([line(3),straps])} active onSend={vi.fn()}/>);
    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(screen.getAllByRole('button',{name:/^Drop this line/})).toHaveLength(1);
  });

  it('offers the drop and the rep when a line has no candidates at all',()=>{
    render(<ClarifyPanel payload={payload([line(2,{requested_text:'widgets',candidates:[],choices:[]})])} active onSend={vi.fn()}/>);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Drop this line: widgets'})).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Call your rep'})).toBeInTheDocument();
  });

  it('shows no rep card when no rep is assigned (the reply\'s text points to Customer Service)',()=>{
    render(<ClarifyPanel payload={payload([line(2)],null)} active onSend={vi.fn()}/>);
    expect(screen.queryByRole('region',{name:'Call your rep'})).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('disables every button while inactive (a reply is on its way)',()=>{
    render(<ClarifyPanel payload={payload([line(2)])} active={false} onSend={vi.fn()}/>);
    for(const button of screen.getAllByRole('button'))expect(button).toBeDisabled();
  });

  it('ignores a payload that is not a request (older messages)',()=>{
    const {container}=render(<ClarifyPanel payload={{question:'Type 1 or Type 27 cut-off wheels?',round:2} as unknown as ClarifyPayload} active onSend={vi.fn()}/>);
    expect(container).toBeEmptyDOMElement();
  });
});
