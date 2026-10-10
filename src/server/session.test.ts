import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {COOKIE,personas,principal,principalFromCookie} from './session';

// Demo personas (v3 spec §8, OA-12, OA-18; task D1): every supplier persona is supplier_admin and
// a rep; rep_role says whether the persona is the manager (Brandi) or a rep (Mara, Eli). The
// customer persona has no rep role. The chooser buttons for Mara and Eli come in F1.

describe('personas',()=>{
  it('keeps Brandi (cookie "supplier") as the manager and Dana as the customer',()=>{
    expect(personas.supplier).toMatchObject({user_id:'brandi',role:'supplier_admin',rep_id:'brandi',rep_role:'manager',customer_id:null});
    expect(personas.customer).toMatchObject({user_id:'dana',role:'customer_user',rep_id:null,rep_role:null,customer_id:'wasatch',contact_id:'dana'});
  });

  it('adds Mara and Eli as supplier reps, each signed in as their own rep',()=>{
    expect(principalFromCookie('mara')).toEqual({user_id:'mara',role:'supplier_admin',customer_id:null,name:'Herrick Industrial Supply',user_name:'Mara Jensen',rep_id:'mara',rep_role:'rep',contact_id:null});
    expect(principalFromCookie('eli')).toEqual({user_id:'eli',role:'supplier_admin',customer_id:null,name:'Herrick Industrial Supply',user_name:'Eli Porter',rep_id:'eli',rep_role:'rep',contact_id:null});
  });

  it('reads the persona from the cookie, and nothing for an unknown or inherited name',()=>{
    const request=(value?:string)=>new NextRequest('http://127.0.0.1/api/session',{headers:value?{cookie:`${COOKIE}=${value}`}:{}});
    expect(principal(request('mara'))?.rep_id).toBe('mara');
    expect(principal(request('brandi'))).toBeNull();
    expect(principal(request('toString'))).toBeNull();
    expect(principal(request())).toBeNull();
  });
});
