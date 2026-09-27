import {expect,it} from 'vitest';
import {renderScale} from './render-pdf';

it('draws pages sharp enough for the screen, within a memory cap',()=>{
  expect(renderScale(1)).toBe(1.5);
  expect(renderScale(2)).toBeCloseTo(2.7);
  expect(renderScale(3)).toBe(3);
  expect(renderScale(0.5)).toBe(1.5);
});
