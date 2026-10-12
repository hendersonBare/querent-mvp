import {describe,expect,it} from 'vitest';
import {floorInput,floorPosition,parseFloorPct} from './format';

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
