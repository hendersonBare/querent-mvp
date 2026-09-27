import {describe,expect,it} from 'vitest';
import {floorInput,floorPosition,parseFloorPct,quotesByRep,reassignedNote} from './format';

const wasatch={id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'mara',rep_name:'Mara Jensen',placeholder:false,
  quotes:[{rep_id:'brandi',rep_name:'Brandi Gallegos',count:25}]};

describe('floor field',()=>{
  it('shows a floor at the precision the warnings use',()=>{
    expect(floorInput(0.3)).toBe('30.0');
    expect(floorInput(0.185)).toBe('18.5');
    expect(floorInput(0.19999999999999998)).toBe('20.0');
    expect(floorInput(0)).toBe('0.0');
  });

  it('reads what the rep typed as a percent, to tenths, from 0 to 99.9',()=>{
    expect(parseFloorPct('25')).toBe(25);
    expect(parseFloorPct(' 27.5 ')).toBe(27.5);
    expect(parseFloorPct('27.5%')).toBe(27.5);
    expect(parseFloorPct('22.45')).toBe(22.5);
    expect(parseFloorPct('.5')).toBe(0.5);
    expect(parseFloorPct('0')).toBe(0);
    expect(parseFloorPct('99.9')).toBe(99.9);
    for(const bad of ['','  ','-1','100','99.96','abc','1e2','20,5','.'])expect(parseFloorPct(bad),bad).toBeNull();
  });

  it('places the floor marker on a 0–50% track',()=>{
    expect(floorPosition(0.2)).toBe('40%');
    expect(floorPosition(0.185)).toBe('37%');
    expect(floorPosition(0)).toBe('0%');
    expect(floorPosition(0.8)).toBe('100%');
  });
});

describe('assignment copy',()=>{
  it("counts a customer's quotes by the rep they belong to",()=>{
    expect(quotesByRep([])).toBe('None yet');
    expect(quotesByRep(wasatch.quotes)).toBe('25 with Brandi Gallegos');
    expect(quotesByRep([...wasatch.quotes,{rep_id:'mara',rep_name:'Mara Jensen',count:1}])).toBe('25 with Brandi Gallegos, 1 with Mara Jensen');
  });

  it('says who has the customer now and that existing quotes stay put',()=>{
    expect(reassignedNote(wasatch)).toBe('Wasatch Mechanical Contractors is now Mara Jensen’s customer. New quote requests go to Mara Jensen. Its 25 existing quotes stay with Brandi Gallegos.');
    expect(reassignedNote({...wasatch,rep_id:'brandi',rep_name:'Brandi Gallegos'})).toBe('Wasatch Mechanical Contractors is now Brandi Gallegos’s customer. New quote requests go to Brandi Gallegos.');
    expect(reassignedNote({...wasatch,quotes:[{rep_id:'brandi',rep_name:'Brandi Gallegos',count:1}]})).toMatch(/Its 1 existing quote stays with Brandi Gallegos\.$/);
    expect(reassignedNote({...wasatch,name:'Great Basin Fabrication',quotes:[]})).toBe('Great Basin Fabrication is now Mara Jensen’s customer. New quote requests go to Mara Jensen.');
  });
});
