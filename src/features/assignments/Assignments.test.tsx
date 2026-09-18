import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {RepAssignments} from './Assignments';
import type {API,AccessRule,Rep} from '@/lib/contracts';
const reps:Rep[]=[{id:'r1',name:'Dallen Rozema',phone:'(801) 111-2222',email:'dallen.rozema@centuryeq.com'}];
const rule:AccessRule={category:'financing',enabled:true,rep_id:null,mixed_rep:false,rep_name:'Self-serve',phone:null,email:null};
it('assigns a rep and refreshes on success',async()=>{
 const send=vi.fn().mockResolvedValue({ok:true});const refresh=vi.fn().mockResolvedValue(undefined);
 const api={send,get:vi.fn()} as API;
 render(<RepAssignments api={api} scope="all" rules={[rule]} reps={reps} refresh={refresh}/>);
 fireEvent.change(screen.getByLabelText('Financing'),{target:{value:'r1'}});
 await waitFor(()=>expect(send).toHaveBeenCalledWith('supplier/assignments/all/financing','PUT',{rep_id:'r1'}));
 expect(refresh).toHaveBeenCalled();
});
it('shows an error and leaves the assignment unchanged when the mutation fails',async()=>{
 const send=vi.fn().mockRejectedValue(new Error('Unable to save.'));const refresh=vi.fn();
 const api={send,get:vi.fn()} as API;
 render(<RepAssignments api={api} scope="all" rules={[rule]} reps={reps} refresh={refresh}/>);
 fireEvent.change(screen.getByLabelText('Financing'),{target:{value:'r1'}});
 expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save.');
 expect(refresh).not.toHaveBeenCalled();
 expect(screen.getByLabelText('Financing')).toHaveValue('');
});
it('renders a disabled Mixed option when reps differ across customers',()=>{
 const mixedRule:AccessRule={...rule,mixed_rep:true,rep_name:'Multiple reps'};
 const api={send:vi.fn(),get:vi.fn()} as API;
 render(<RepAssignments api={api} scope="all" rules={[mixedRule]} reps={reps} refresh={vi.fn()}/>);
 expect(screen.getByLabelText('Financing')).toHaveValue('mixed');
 expect(screen.getByRole('option',{name:'Mixed'})).toBeDisabled();
});
