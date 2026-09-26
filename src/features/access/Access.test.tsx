import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {AccessSwitches} from './Access';
import type {API,AccessRule} from '@/lib/contracts';
it('calls API and refreshes after a switch changes',async()=>{
 const send=vi.fn().mockResolvedValue({ok:true});const refreshed=vi.fn();
 const api={send,get:vi.fn()} as API;
 const rule:AccessRule={category:'pricing',enabled:true,rep_id:null,mixed_rep:false,rep_name:'Self-serve',phone:null,email:null};
 render(<AccessSwitches api={api} scope="all" rules={[rule]} refresh={refreshed}/>);
 fireEvent.click(screen.getByRole('switch',{name:'Pricing'}));
 await waitFor(()=>expect(send).toHaveBeenCalledWith('supplier/access/all/pricing','PUT',{enabled:false}));
 expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','false');
 expect(refreshed).toHaveBeenCalled();
});
it('rolls back to the last known state when the mutation fails',async()=>{
 const send=vi.fn().mockRejectedValue(new Error('Unable to save.'));const refreshed=vi.fn();
 const api={send,get:vi.fn()} as API;
 const rule:AccessRule={category:'pricing',enabled:true,rep_id:null,mixed_rep:false,rep_name:'Self-serve',phone:null,email:null};
 render(<AccessSwitches api={api} scope="all" rules={[rule]} refresh={refreshed}/>);
 fireEvent.click(screen.getByRole('switch',{name:'Pricing'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save.');
 expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
 expect(refreshed).not.toHaveBeenCalled();
});
it('shows a Mixed switch and resolves it to a single state when toggled',async()=>{
 const send=vi.fn().mockResolvedValue({ok:true});
 const api={send,get:vi.fn()} as API;
 const rule:AccessRule={category:'pricing',enabled:null,rep_id:null,mixed_rep:false,rep_name:'Multiple reps',phone:null,email:null};
 render(<AccessSwitches api={api} scope="all" rules={[rule]} refresh={()=>{}}/>);
 const toggle=screen.getByRole('switch',{name:'Pricing'});
 expect(toggle).toHaveAttribute('aria-checked','mixed');
 expect(screen.getByText('Mixed across customers')).toBeInTheDocument();
 fireEvent.click(toggle);
 await waitFor(()=>expect(send).toHaveBeenCalledWith('supplier/access/all/pricing','PUT',{enabled:true}));
 expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
});
