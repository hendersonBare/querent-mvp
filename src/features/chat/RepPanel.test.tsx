import {render,screen} from '@testing-library/react';
import {it,expect} from 'vitest';
import {RepPanel} from './RepPanel';
import type {AccessRule} from '@/lib/contracts';
it('hides disabled categories and renders contact links',()=>{
 const rules:AccessRule[]=[{category:'items_stock',enabled:true,rep_id:'brandi',mixed_rep:false,rep_name:'Brandi Gallegos',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},{category:'pricing',enabled:false,rep_id:'brandi',mixed_rep:false,rep_name:'Brandi Gallegos',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'}];
 render(<RepPanel rules={rules}/>);
 expect(screen.getByText('Items & stock')).toBeInTheDocument();
 expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
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
