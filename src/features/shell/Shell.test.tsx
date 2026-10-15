import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';

// The BOXT shell (docs/boxt/plan.md, product rule 2): the rail reaches exactly Quote creation tool,
// Quotes and Settings, names the org "BOXT Packaging", and ends with the signed-in user's email and
// Sign out (a form POST, so B2 can hand it a server action or keep the route).

const nav=vi.hoisted(()=>({pathname:'/quote-tool'}));
vi.mock('next/navigation',()=>({usePathname:()=>nav.pathname}));
vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {AppShell}=await import('./AppShell');
const {PageFrame}=await import('./PageFrame');

const renderShell=(pathname='/quote-tool')=>{
  nav.pathname=pathname;
  return render(<AppShell email="rep@example.com"><PageFrame title="Quotes"><p>Body</p></PageFrame></AppShell>);
};
const railNav=()=>screen.getByRole('navigation',{name:'Main'});

describe('the rail',()=>{
  it('links exactly Quote creation tool, Quotes and Settings, in that order',()=>{
    renderShell();
    const links=within(railNav()).getAllByRole('link');
    expect(links.map(a=>[a.textContent,a.getAttribute('href')])).toEqual([
      ['Quote creation tool','/quote-tool'],
      ['Quotes','/quotes'],
      ['Settings','/settings'],
    ]);
    // Every nav item carries its icon.
    for(const link of links)expect(link.querySelector('svg')).not.toBeNull();
  });

  it('has no other link anywhere in the shell',()=>{
    renderShell();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('shows Querent and the org "BOXT Packaging"',()=>{
    renderShell();
    const rail=screen.getByRole('complementary');
    expect(within(rail).getByRole('img',{name:'Querent'})).toBeInTheDocument();
    expect(within(rail).getByText('Querent')).toBeInTheDocument();
    expect(within(rail).getByText('BOXT Packaging')).toBeInTheDocument();
  });

  it('marks the current section, also on a page under it',()=>{
    renderShell('/quotes');
    expect(within(railNav()).getByRole('link',{name:'Quotes'})).toHaveAttribute('aria-current','page');
    expect(within(railNav()).getByRole('link',{name:'Quote creation tool'})).not.toHaveAttribute('aria-current');
    renderShell('/quotes/3f2a');
    expect(screen.getAllByRole('link',{name:'Quotes'}).at(-1)).toHaveAttribute('aria-current','page');
  });

  it('ends with the user email and a Sign out button that posts to /api/auth/signout',()=>{
    renderShell();
    const rail=screen.getByRole('complementary');
    expect(within(rail).getByText('rep@example.com')).toBeInTheDocument();
    const button=within(rail).getByRole('button',{name:'Sign out'});
    expect(button).toHaveAttribute('type','submit');
    const form=button.closest('form')!;
    expect(form).toHaveAttribute('method','post');
    expect(form).toHaveAttribute('action','/api/auth/signout');
  });
});

describe('the page frame',()=>{
  it('puts the page title in a level-one heading above the page body, inside main',()=>{
    renderShell();
    const main=screen.getByRole('main');
    expect(within(main).getByRole('heading',{level:1,name:'Quotes'})).toBeInTheDocument();
    expect(within(main).getByText('Body')).toBeInTheDocument();
  });
});
