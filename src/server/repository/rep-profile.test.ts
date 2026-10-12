import {describe,expect,it} from 'vitest';
import {assignedRep,assignedRepPicture,rep,repNotificationPrefs,repPicture,repProfile,setRepNotificationPrefs,setRepPicture,setRepProfile} from './accounts';
import {useSeededDatabase} from './test-db';

// The rep's own profile, picture and notification choices (plan U9; Appendix C "rep profile",
// "rep_notification_prefs"). Each function takes the rep whose row it reads or writes; the routes pass
// the signed-in rep only.
useSeededDatabase();

const PNG=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);

describe('repProfile and setRepProfile',()=>{
  it("reads a rep's name, initials, title, phone and email, and when their picture changed (none on the seed)",()=>{
    expect(repProfile('mara')).toEqual({id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com',picture_updated_at:null});
    expect(repProfile('nobody')).toBeUndefined();
  });

  it("stores the name, initials, phone and email on that rep's row only",()=>{
    expect(setRepProfile('mara',{name:'Mara J. Jensen',initials:'MJ',phone:'(801) 555-0199',email:'mara@example.com'})).toMatchObject({name:'Mara J. Jensen',phone:'(801) 555-0199',email:'mara@example.com'});
    expect(rep('mara')).toMatchObject({name:'Mara J. Jensen',phone:'(801) 555-0199'});
    expect(rep('eli')).toMatchObject({name:'Eli Porter',phone:'(801) 555-0103'});
    expect(setRepProfile('nobody',{name:'X',initials:'X',phone:'1',email:'x@example.com'})).toBeUndefined();
    setRepProfile('mara',{name:'Mara Jensen',initials:'MJ',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com'});
  });
});

describe('repPicture, setRepPicture and assignedRepPicture',()=>{
  it("stores one picture per rep, reads it back with its type, and clears it",()=>{
    expect(repPicture('brandi')).toBeUndefined();
    expect(setRepPicture('brandi',{type:'image/png',data:PNG,at:'2026-10-12T10:00:00.000Z'})).toBe(true);
    const stored=repPicture('brandi')!;
    expect(stored.type).toBe('image/png');
    expect(Buffer.from(stored.data).equals(PNG)).toBe(true);
    expect(stored.updated_at).toBe('2026-10-12T10:00:00.000Z');
    expect(repProfile('brandi')?.picture_updated_at).toBe('2026-10-12T10:00:00.000Z');
    // Wasatch's rep is Brandi: the customer reads her picture through its own rep only.
    expect(assignedRepPicture('wasatch')?.type).toBe('image/png');
    expect(assignedRepPicture('canyon-ridge')).toBeUndefined();
    expect(repPicture('mara')).toBeUndefined();
    expect(setRepPicture('brandi',null)).toBe(true);
    expect(repPicture('brandi')).toBeUndefined();
    expect(repProfile('brandi')?.picture_updated_at).toBeNull();
    expect(setRepPicture('nobody',{type:'image/png',data:PNG,at:'2026-10-12T10:00:00.000Z'})).toBe(false);
  });

  it('never puts the picture into the rep reads the rest of the app uses',()=>{
    setRepPicture('brandi',{type:'image/png',data:PNG,at:'2026-10-12T10:00:00.000Z'});
    expect(Object.keys(rep('brandi')!).sort()).toEqual(['email','id','initials','name','phone','title']);
    expect(Object.keys(assignedRep('wasatch')!).sort()).toEqual(['email','id','initials','name','phone','title']);
    setRepPicture('brandi',null);
  });
});

describe('repNotificationPrefs and setRepNotificationPrefs',()=>{
  it('reads every choice as on until the rep stores one, and stores only the keys given',()=>{
    expect(repNotificationPrefs('mara')).toEqual({});
    expect(setRepNotificationPrefs('mara',{quote_aging:false,quote_declined:false})).toEqual({quote_aging:false,quote_declined:false});
    expect(setRepNotificationPrefs('mara',{quote_aging:true})).toEqual({quote_aging:true,quote_declined:false});
    expect(repNotificationPrefs('eli')).toEqual({});
    setRepNotificationPrefs('mara',{quote_declined:true});
  });
});
