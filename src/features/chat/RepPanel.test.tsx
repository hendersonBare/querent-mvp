import {render,screen} from '@testing-library/react';
import {it,expect} from 'vitest';
import {RepPanel} from './RepPanel';
import type {AccessRule} from '@/lib/contracts';
it('hides disabled categories and renders contact links',()=>{
 const rules:AccessRule[]=[{category:'parts_stock',enabled:true,rep_id:'1',mixed_rep:false,rep_name:'Brandi Gallegos',phone:'(801) 111-2222',email:'Brandi.Gallegos@herrickindustrial.com'},{category:'financing',enabled:false,rep_id:null,mixed_rep:false,rep_name:'Self-serve',phone:null,email:null}];
 render(<RepPanel rules={rules}/>);
 expect(screen.queryByText('Financing')).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:'(801) 111-2222'})).toHaveAttribute('href','tel:8011112222');
});
it('shows a loading state instead of the empty state before rules arrive',()=>{
 render(<RepPanel rules={null}/>);
 expect(screen.getByText('Loading contacts…')).toBeInTheDocument();
 expect(screen.queryByText('No categories are currently available.')).not.toBeInTheDocument();
});
it('shows the empty state once loaded rules contain no enabled categories',()=>{
 render(<RepPanel rules={[]}/>);
 expect(screen.getByText('No categories are currently available.')).toBeInTheDocument();
});
