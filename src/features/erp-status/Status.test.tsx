import {render,screen} from '@testing-library/react';
import {describe,it,expect} from 'vitest';
import {StatusIndicator} from './Status';
describe('ERP status',()=>{
 it('shows fresh and stale states from actual timestamps',()=>{
   const now=Date.parse('2026-09-17T12:00:00Z');
   const {rerender}=render(<StatusIndicator timestamp="2026-09-17T11:59:00Z" now={now}/>);
   expect(screen.getByText('Connected')).toBeInTheDocument();
   rerender(<StatusIndicator timestamp="2026-09-17T11:57:00Z" now={now}/>);
   expect(screen.getByText('Update delayed')).toBeInTheDocument();
 });
});
