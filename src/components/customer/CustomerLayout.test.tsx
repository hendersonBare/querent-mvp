import {fireEvent,render,screen,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CustomerLayout} from './CustomerLayout';
import {dana,fakeApi,sidebarRoutes} from './test-fixtures';

const renderLayout=(signOut=vi.fn())=>render(<CustomerLayout api={fakeApi(sidebarRoutes)} user={dana} signOut={signOut}><p>Chat goes here</p></CustomerLayout>);

it('frames the chat with contacts on the left and quotes on the right',async()=>{
  const {container}=renderLayout();
  const left=screen.getByRole('complementary',{name:'Contacts'});
  const right=screen.getByRole('complementary',{name:'Quotes'});
  const chat=screen.getByText('Chat goes here');
  expect(left.compareDocumentPosition(chat)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(chat.compareDocumentPosition(right)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(await within(left).findByText('Brandi Gallegos')).toBeInTheDocument();
  expect(await within(right).findAllByRole('button',{name:/^Quote · /})).toHaveLength(5);
  expect(container.querySelector('.customer-header')).toHaveTextContent('Wasatch Mechanical Contractors');
});

it('keeps Switch workspace in the header, named even when its text is hidden on a phone',()=>{
  const signOut=vi.fn();
  renderLayout(signOut);
  fireEvent.click(screen.getByRole('button',{name:'Switch workspace'}));
  expect(signOut).toHaveBeenCalled();
});

it('has Chat / Contacts / Quotes tabs for narrow screens, starting on Chat',()=>{
  const {container}=renderLayout();
  const body=container.querySelector('.cx-body')!;
  const tabs=screen.getAllByRole('tab');
  expect(tabs.map(t=>t.textContent)).toEqual(['Chat','Contacts','Quotes']);
  expect(body).toHaveAttribute('data-pane','chat');
  expect(screen.getByRole('tab',{name:'Chat'})).toHaveAttribute('aria-selected','true');

  fireEvent.click(screen.getByRole('tab',{name:'Quotes'}));
  expect(body).toHaveAttribute('data-pane','quotes');
  expect(screen.getByRole('tab',{name:'Quotes'})).toHaveAttribute('aria-selected','true');
  expect(screen.getByRole('tab',{name:'Chat'})).toHaveAttribute('aria-selected','false');
  expect(screen.getByRole('tab',{name:'Quotes'})).toHaveAttribute('aria-controls',screen.getByRole('complementary',{name:'Quotes'}).id);
});

it('moves between tabs with the arrow keys',()=>{
  const {container}=renderLayout();
  const chat=screen.getByRole('tab',{name:'Chat'});
  expect(chat).toHaveAttribute('tabindex','0');
  expect(screen.getByRole('tab',{name:'Contacts'})).toHaveAttribute('tabindex','-1');
  fireEvent.keyDown(chat,{key:'ArrowRight'});
  expect(container.querySelector('.cx-body')).toHaveAttribute('data-pane','contacts');
  expect(screen.getByRole('tab',{name:'Contacts'})).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('tab',{name:'Contacts'}),{key:'ArrowLeft'});
  fireEvent.keyDown(screen.getByRole('tab',{name:'Chat'}),{key:'ArrowLeft'});
  expect(container.querySelector('.cx-body')).toHaveAttribute('data-pane','quotes');
});
