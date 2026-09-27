import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ClarifyPayload,QuoteNotice} from '@/domain';
import type {API,ChatAnswer,ChatTurn,Principal} from '@/lib/contracts';
import {onOpenQuote} from '@/components/customer/open-quote';
import {QUOTES_CHANGED_EVENT} from '@/components/customer/quotes-changed';
import {sidebarRoutes} from '@/components/customer/test-fixtures';
import {CustomerChat} from './Chat';

// "Quote … is ready" in the customer chat (spec §3, task 5.1): the messages Approve & send posted
// show among the turns after a reload, and a new one shows up without one (the chat polls).

const user:Principal={user_id:'u1',role:'customer_user',customer_id:'wasatch',name:'Wasatch Mechanical Contractors',user_name:'Dana Ortiz',rep_id:null,contact_id:'dana'};
const CONVERSATION='conv-1';
const turn=(t:Partial<ChatTurn>&Pick<ChatTurn,'id'|'question'|'answer'>):ChatTurn=>({categories:[],outcome:'answered',row_count:0,...t});
const notice=(id:string,created_at:string,extra:Partial<QuoteNotice>={}):QuoteNotice=>({id,conversation_id:CONVERSATION,created_at,text:'Hi Dana, here it is.\nThanks, Brandi',
  quote_id:'q-24818',quote_number:'Q-24818',revision:1,total:531,valid_until:'2026-10-07',headline:'Quote Q-24818 is ready: $531.00, valid until Oct 7',attach_pdf:true,
  pdf_url:'/api/quotes/q-24818/pdf?variant=customer&rev=1',...extra});
const HISTORY=[turn({id:'t1',question:'Do you have bolts?',answer:'Yes, 64 at SLC.',timestamp:'2026-09-23T16:00:00.000Z'}),
  turn({id:'t2',question:'What is our balance?',answer:'Your open balance is $18,420.00.',timestamp:'2026-09-23T18:00:00.000Z'})];

function makeApi({history=HISTORY,notices=()=>[] as QuoteNotice[]}:{history?:ChatTurn[];notices?:()=>QuoteNotice[]}={}){
  const get=vi.fn(async(path:string):Promise<unknown>=>{
    if(path in sidebarRoutes)return sidebarRoutes[path as keyof typeof sidebarRoutes];
    if(path===`customer/history/${CONVERSATION}`)return history;
    if(path===`customer/notices/${CONVERSATION}`)return notices();
    throw new Error(`unexpected get ${path}`);
  });
  const send=vi.fn(async():Promise<ChatAnswer>=>({answer:'Answered.',categories:[],outcome:'answered',row_count:0}));
  return {api:{get,send} as unknown as API,get,send};
}
/** The chat's articles in order, by what names them: a question, or a notice's headline. */
const order=()=>[...document.querySelectorAll('.turns > article')].map(a=>a.classList.contains('quote-notice')?`notice:${a.querySelector('.qn-headline')!.textContent}`:`turn:${a.querySelector('.question-bubble')!.textContent}`);

beforeEach(()=>{localStorage.clear();localStorage.setItem('querent-conversation-u1',CONVERSATION);});

describe('quote notices in the chat',()=>{
  it('shows a sent quote among the turns by when it was sent, after a reload too',async()=>{
    const {api}=makeApi({notices:()=>[notice('n1','2026-09-23T17:00:00.000Z')]});
    const {unmount}=render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    const card=await screen.findByRole('article',{name:'Quote Q-24818 is ready: $531.00, valid until Oct 7'});
    expect(order()).toEqual(['turn:Do you have bolts?','notice:Quote Q-24818 is ready: $531.00, valid until Oct 7','turn:What is our balance?']);
    expect(card.querySelector('.qn-text')!.textContent).toBe('Hi Dana, here it is.\nThanks, Brandi');
    unmount();
    render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    await screen.findByRole('article',{name:/Quote Q-24818 is ready/});
    expect(order()).toHaveLength(3);
  });

  it('View quote opens the preview modal on that revision',async()=>{
    const opened=vi.fn();
    const stop=onOpenQuote(opened);
    const {api,get}=makeApi({notices:()=>[notice('n1','2026-09-23T17:00:00.000Z')]});
    try{
      render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
      const card=await screen.findByRole('article',{name:/Quote Q-24818 is ready/});
      fireEvent.click(within(card).getByRole('button',{name:'View quote'}));
    }finally{stop();}
    expect(opened).toHaveBeenCalledWith({id:'q-24818',quote_number:'Q-24818',revision:1});
    // The layout's modal (the one the sidebar opens) loads that revision.
    expect(await screen.findByRole('dialog',{name:'Quote Q-24818'})).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('customer/quotes/q-24818?rev=1');
  });

  it('shows a quote sent while the chat is open without a reload, after the turns on screen, and refreshes the quotes sidebar',async()=>{
    let sent:QuoteNotice[]=[];
    const {api,get}=makeApi({notices:()=>sent});
    const changed=vi.fn();
    window.addEventListener(QUOTES_CHANGED_EVENT,changed);
    try{
      render(<CustomerChat api={api} user={user} signOut={()=>{}} noticePollMs={25}/>);
      await screen.findByText('Your open balance is $18,420.00.');
      await waitFor(()=>expect(get.mock.calls.filter(([p])=>p===`customer/notices/${CONVERSATION}`).length).toBeGreaterThan(1));
      expect(screen.queryByRole('article',{name:/is ready/})).toBeNull();
      expect(changed).not.toHaveBeenCalled();
      // Brandi sends: it arrived after everything on screen, so it goes last.
      sent=[notice('n2','2026-09-23T19:00:00.000Z')];
      await screen.findByRole('article',{name:/Quote Q-24818 is ready/});
      expect(order().at(-1)).toBe('notice:Quote Q-24818 is ready: $531.00, valid until Oct 7');
      await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
      // Later polls with nothing new change nothing.
      const calls=get.mock.calls.length;
      await waitFor(()=>expect(get.mock.calls.length).toBeGreaterThan(calls+2));
      expect(changed).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('article',{name:/is ready/})).toHaveLength(1);
    }finally{window.removeEventListener(QUOTES_CHANGED_EVENT,changed);}
  });

  it('announces a new quote once, even when two polls answer before the chat re-renders',async()=>{
    const pending:((value:QuoteNotice[])=>void)[]=[];
    let polling=false;
    const get=vi.fn((path:string):Promise<unknown>=>{
      if(path in sidebarRoutes)return Promise.resolve(sidebarRoutes[path as keyof typeof sidebarRoutes]);
      if(path===`customer/history/${CONVERSATION}`)return Promise.resolve(HISTORY);
      if(path===`customer/notices/${CONVERSATION}`){
        if(!polling){polling=true;return Promise.resolve([]);}
        return new Promise<QuoteNotice[]>(resolve=>pending.push(resolve));
      }
      return Promise.reject(new Error(`unexpected get ${path}`));
    });
    const changed=vi.fn();
    window.addEventListener(QUOTES_CHANGED_EVENT,changed);
    try{
      render(<CustomerChat api={{get,send:vi.fn()} as unknown as API} user={user} signOut={()=>{}} noticePollMs={10}/>);
      await waitFor(()=>expect(pending.length).toBeGreaterThanOrEqual(2));
      await act(async()=>{for(const resolve of pending.splice(0))resolve([notice('n1','2026-09-23T19:00:00.000Z')]);});
      expect(changed).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('article',{name:/is ready/})).toHaveLength(1);
    }finally{window.removeEventListener(QUOTES_CHANGED_EVENT,changed);}
  });

  it('stops polling for notices while the tab is hidden, and checks again as soon as it is shown',async()=>{
    const {api,get}=makeApi();
    const polls=()=>get.mock.calls.filter(([p])=>p===`customer/notices/${CONVERSATION}`).length;
    const setVisibility=(state:'hidden'|'visible')=>{
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>state});
      document.dispatchEvent(new Event('visibilitychange'));
    };
    try{
      render(<CustomerChat api={api} user={user} signOut={()=>{}} noticePollMs={20}/>);
      await screen.findByText('Your open balance is $18,420.00.');
      await waitFor(()=>expect(polls()).toBeGreaterThan(2));
      setVisibility('hidden');
      const hiddenAt=polls();
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,150));});
      expect(polls()).toBe(hiddenAt);
      setVisibility('visible');
      expect(polls()).toBe(hiddenAt+1);
    }finally{
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});
    }
  });

  it('a question asked after the notice goes after it',async()=>{
    const {api}=makeApi({notices:()=>[notice('n1','2026-09-23T19:00:00.000Z')]});
    render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    await screen.findByRole('article',{name:/is ready/});
    fireEvent.change(screen.getByLabelText('Ask a question'),{target:{value:'Thanks'}});
    fireEvent.click(screen.getByLabelText('Send question'));
    await screen.findByText('Answered.');
    expect(order()).toEqual(['turn:Do you have bolts?','turn:What is our balance?','notice:Quote Q-24818 is ready: $531.00, valid until Oct 7','turn:Thanks']);
  });

  it('in a conversation with no turns yet, keeps the welcome and shows the notice under it',async()=>{
    const {api}=makeApi({history:[],notices:()=>[notice('n1','2026-09-23T19:00:00.000Z')]});
    render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    await screen.findByRole('article',{name:/is ready/});
    expect(screen.getByRole('heading',{name:/Your business/})).toBeInTheDocument();
  });

  it('shows the history even when the notices can’t load, and New conversation clears them',async()=>{
    let fail=true;
    const {api}=makeApi({notices:()=>{if(fail)throw new Error('down');return [notice('n1','2026-09-23T17:00:00.000Z')];}});
    render(<CustomerChat api={api} user={user} signOut={()=>{}} noticePollMs={25}/>);
    await screen.findByText('Your open balance is $18,420.00.');
    expect(screen.queryByRole('alert')).toBeNull();
    fail=false;
    await screen.findByRole('article',{name:/is ready/});
    fireEvent.click(screen.getByRole('button',{name:'New conversation'}));
    await act(async()=>{});
    expect(screen.queryByRole('article',{name:/is ready/})).toBeNull();
  });

  it('leaves the clarifying reply answerable when a notice follows it (task 2.2 still holds)',async()=>{
    const clarify:ClarifyPayload={open:[{requested_text:'6 boxes of cut-off wheels',qty:6,question:'Type 1 or Type 27 cut-off wheels?',round:2,candidates:[],
      choices:[{sku:'CW-45-045-T1',description:'Cut-off wheel, Type 1',pack:'Box of 25',category_name:'Abrasives'}],text:'cut-off wheels'}],cart:{fulfillment:'will_call',branch_id:'slc',lines:[]},dropped:[],rep:null};
    const history=[turn({id:'t1',question:'Quote wheels',answer:'Type 1 or Type 27 cut-off wheels?',kind:'clarify',payload:clarify,timestamp:'2026-09-23T16:00:00.000Z'})];
    const {api}=makeApi({history,notices:()=>[notice('n1','2026-09-23T17:00:00.000Z')]});
    render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    await screen.findByRole('article',{name:/is ready/});
    expect(screen.getByRole('button',{name:/CW-45-045-T1/})).toBeEnabled();
  });
});
