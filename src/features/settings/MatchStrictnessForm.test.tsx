import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DEFAULT_LEVEL,LEVELS,STRICTNESS_LEVELS,type StrictnessLevel} from './strictness';

// The Match strictness card on /settings (docs/boxt/plan.md B7): the three levels from LEVELS as a radio
// group with their one-line descriptions, the default marked "Default" and "Recommended", the saved
// level selected, Save disabled until the choice changes, PUT /api/settings on Save, and one plain line
// for the result.

const fetchMock=vi.fn<typeof fetch>();
beforeEach(()=>{
  fetchMock.mockReset();
  vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>vi.unstubAllGlobals());

const reply=(status:number,body:unknown)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));

const {MatchStrictnessForm}=await import('./MatchStrictnessForm');

const group=()=>screen.getByRole('radiogroup',{name:'Match strictness'});
const radio=(level:StrictnessLevel)=>screen.getByRole('radio',{name:new RegExp(`^${LEVELS[level].label}\\b`)});
const save=()=>screen.getByRole('button',{name:'Save'});
const EM_DASH='—';

describe('MatchStrictnessForm',()=>{
  it('offers the three levels from LEVELS in order, each with its label and description',()=>{
    render(<MatchStrictnessForm initial={DEFAULT_LEVEL}/>);
    const radios=within(group()).getAllByRole('radio');
    expect(radios.map(r=>(r as HTMLInputElement).value)).toEqual([...STRICTNESS_LEVELS]);
    expect(STRICTNESS_LEVELS.map(level=>LEVELS[level].label)).toEqual(['Strict','Balanced','Lenient']);
    for(const level of STRICTNESS_LEVELS){
      expect(radio(level)).toHaveAccessibleDescription(LEVELS[level].description);
      expect(screen.getByText(LEVELS[level].description)).toBeInTheDocument();
    }
  });

  it('marks the default level, and only it, "Default" and "Recommended"',()=>{
    render(<MatchStrictnessForm initial="lenient"/>);
    expect(DEFAULT_LEVEL).toBe('strict');
    expect(screen.getAllByText('Default')).toHaveLength(1);
    expect(screen.getAllByText('Recommended')).toHaveLength(1);
    const option=screen.getByText('Default').closest('label');
    expect(option).toContainElement(radio(DEFAULT_LEVEL));
    expect(option).toContainElement(screen.getByText('Recommended'));
  });

  it('shows the saved level selected',()=>{
    render(<MatchStrictnessForm initial={DEFAULT_LEVEL}/>);
    expect(radio('strict')).toBeChecked();
    expect(radio('balanced')).not.toBeChecked();
    expect(radio('lenient')).not.toBeChecked();
  });

  it('explains what strictness does and who it applies to',()=>{
    render(<MatchStrictnessForm initial="strict"/>);
    expect(screen.getByText('Strict puts fewer items on a quote automatically. Anything it is unsure about is left for you to match.')).toBeInTheDocument();
    expect(screen.getByText(/applies to every user in the company/)).toBeInTheDocument();
    expect(screen.getByText(/new match runs only/)).toBeInTheDocument();
    expect(screen.getByText(/Existing quotes do not change\./)).toBeInTheDocument();
  });

  it('keeps Save disabled until the choice differs from the saved level',()=>{
    render(<MatchStrictnessForm initial="strict"/>);
    expect(save()).toBeDisabled();
    fireEvent.click(radio('balanced'));
    expect(radio('balanced')).toBeChecked();
    expect(save()).toBeEnabled();
    fireEvent.click(radio('strict'));
    expect(save()).toBeDisabled();
  });

  it('saves with PUT /api/settings and says so in one line',async()=>{
    fetchMock.mockReturnValueOnce(reply(200,{matchStrictness:'balanced'}));
    render(<MatchStrictnessForm initial="strict"/>);
    fireEvent.click(radio('balanced'));
    fireEvent.click(save());
    const status=await screen.findByRole('status');
    await waitFor(()=>expect(status).toHaveTextContent('Saved. New match runs use Balanced.'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({matchStrictness:'balanced'});
    // Saved: Balanced is now the saved level, so Save is disabled again.
    expect(radio('balanced')).toBeChecked();
    expect(save()).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the server\'s error in one line and keeps the choice to retry',async()=>{
    fetchMock.mockReturnValueOnce(reply(403,{error:'You are not allowed to change this setting.'}));
    render(<MatchStrictnessForm initial="strict"/>);
    fireEvent.click(radio('lenient'));
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('You are not allowed to change this setting.');
    expect(radio('lenient')).toBeChecked();
    expect(save()).toBeEnabled();
  });

  it('shows a plain error when the request fails',async()=>{
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<MatchStrictnessForm initial="strict"/>);
    fireEvent.click(radio('lenient'));
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('The setting could not be saved. Try again.');
  });

  it('clears the message when the choice changes again',async()=>{
    fetchMock.mockReturnValueOnce(reply(200,{matchStrictness:'balanced'}));
    render(<MatchStrictnessForm initial="strict"/>);
    fireEvent.click(radio('balanced'));
    fireEvent.click(save());
    await screen.findByRole('status');
    fireEvent.click(radio('lenient'));
    expect(screen.queryByText(/^Saved\./)).toBeNull();
  });

  it('never uses the em dash',()=>{
    const {container}=render(<MatchStrictnessForm initial="strict"/>);
    expect(container.textContent).not.toContain(EM_DASH);
  });
});
