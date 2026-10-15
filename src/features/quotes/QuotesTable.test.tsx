import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {EXAMPLE_ID,QUOTE_ID,summary} from './test-fixtures';

// The /quotes list (docs/boxt/plan.md B6): newest first as the repository returns them, with Customer,
// Reference, Lines, Total, Created by and Created; the example quote carries an "Example" tag; an empty
// customer or reference reads "Not set"; the example's creator reads "Example"; each row opens /quotes/[id]; one plain line when there are none.

vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {QuotesTable}=await import('./QuotesTable');

const OTHER='7c7c7c7c-0000-4000-8000-000000000007';
const rows=[
  summary(),
  summary({id:OTHER,customerName:'',reference:'',lineCount:1,unmatchedCount:0,total:0,createdByEmail:'rep2@boxt.test',createdAt:'2026-10-14T09:30:00.000Z'}),
  summary({id:EXAMPLE_ID,isExample:true,customerName:'Example customer',reference:'Example quote',lineCount:4,unmatchedCount:1,total:830.5,createdByEmail:null,createdAt:'2026-10-01T08:00:00.000Z'}),
];

const bodyRows=()=>screen.getAllByRole('row').slice(1);

describe('QuotesTable',()=>{
  it('has the columns Customer, Reference, Lines, Total, Created by, Created',()=>{
    render(<QuotesTable quotes={rows}/>);
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Customer','Reference','Lines','Total','Created by','Created']);
  });

  it('shows one row per quote in the order given, with its values',()=>{
    render(<QuotesTable quotes={rows}/>);
    const list=bodyRows();
    expect(list).toHaveLength(3);
    const cells=within(list[0]).getAllByRole('cell').map(c=>c.textContent?.replace(/\s/g,' '));
    expect(cells[0]).toBe('Acme Fulfilment');
    expect(cells[1]).toBe('PO-7781');
    expect(cells[2]).toMatch(/^4\b/);
    expect(cells[2]).toMatch(/1 unmatched/);
    expect(cells[3]).toBe('$1,775.98');
    expect(cells[4]).toBe('rep@boxt.test');
    expect(cells[5]).toMatch(/Oct 15, 2026, \d{1,2}:\d{2} (AM|PM)/);
  });

  it('shows "Not set" for an empty customer or reference, and "Example" as the example quote\'s creator',()=>{
    render(<QuotesTable quotes={rows}/>);
    const cells=within(bodyRows()[1]).getAllByRole('cell');
    expect(cells[0].textContent).toBe('Not set');
    expect(cells[1].textContent).toBe('Not set');
    expect(within(bodyRows()[2]).getAllByRole('cell')[4].textContent).toBe('Example');
    expect(screen.queryByText('None')).toBeNull();
    expect(cells[3].textContent).toBe('$0.00');
  });

  it('marks the example quote with an Example tag, and only it',()=>{
    render(<QuotesTable quotes={rows}/>);
    const [first,,example]=bodyRows();
    expect(within(within(example).getAllByRole('cell')[0]).getByText('Example')).toBeInTheDocument();
    expect(within(first).queryByText('Example')).toBeNull();
    expect(within(bodyRows()[1]).queryByText('Example')).toBeNull();
  });

  it('links each row to its quote',()=>{
    render(<QuotesTable quotes={rows}/>);
    const hrefs=bodyRows().map(r=>within(r).getByRole('link').getAttribute('href'));
    expect(hrefs).toEqual([`/quotes/${QUOTE_ID}`,`/quotes/${OTHER}`,`/quotes/${EXAMPLE_ID}`]);
  });

  it('says so in one plain line, linking the quote creation tool, when there are no quotes',()=>{
    render(<QuotesTable quotes={[]}/>);
    expect(screen.queryByRole('table')).toBeNull();
    const line=screen.getByText((_t,el)=>el?.tagName==='P'&&el.textContent==='No quotes yet. Create one with the Quote creation tool.');
    expect(within(line).getByRole('link',{name:'Quote creation tool'})).toHaveAttribute('href','/quote-tool');
  });

  it('never prints an em dash',()=>{
    const {container}=render(<QuotesTable quotes={rows}/>);
    expect(container.textContent).not.toContain('\u2014');
  });
});
