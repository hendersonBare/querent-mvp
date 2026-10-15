import {render,screen} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';

// The /settings page (docs/boxt/plan.md B7): it checks the session (requireUser('/settings')), reads the
// organization's setting through the repository with the user's client, and shows the Match strictness
// card with that level selected, then "Other settings coming soon." and nothing else.

const auth=vi.hoisted(()=>({requireUser:vi.fn()}));
vi.mock('@/features/auth/server',()=>auth);
const repo=vi.hoisted(()=>({getOrgSettings:vi.fn()}));
vi.mock('@/server/repository',async original=>({...await original<typeof import('@/server/repository')>(),...repo}));

const {default:SettingsPage}=await import('./page');

beforeEach(()=>{
  auth.requireUser.mockReset().mockResolvedValue({user:{id:'u1',email:'rep@boxt.test'},db:{tag:'user-db'}});
  repo.getOrgSettings.mockReset().mockResolvedValue({matchStrictness:'balanced',updatedAt:'2026-10-15T09:00:00.000Z',updatedBy:'u1'});
});

describe('/settings',()=>{
  it('requires a session, reads the setting with the user\'s client and shows it selected',async()=>{
    render(await SettingsPage());
    expect(auth.requireUser).toHaveBeenCalledWith('/settings');
    expect(repo.getOrgSettings).toHaveBeenCalledWith({tag:'user-db'});
    expect(screen.getByRole('heading',{level:1,name:'Settings'})).toBeInTheDocument();
    expect(screen.getByRole('radiogroup',{name:'Match strictness'})).toBeInTheDocument();
    expect(screen.getByRole('radio',{name:/^Balanced\b/})).toBeChecked();
  });

  it('has the one card, then "Other settings coming soon." and nothing else',async()=>{
    const {container}=render(await SettingsPage());
    expect(screen.getByText('Other settings coming soon.')).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
    expect(screen.getAllByRole('button').map(b=>b.textContent)).toEqual(['Save']);
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.textContent).not.toContain('\u2014');
  });
});
