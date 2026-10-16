import {describe,expect,it} from 'vitest';
import {normalize,stem} from './text';

describe('normalize',()=>{
  it('spells out unicode fractions, keeping mixed numbers together',()=>{
    expect(normalize('8½ x 12" Mailers')).toBe('8-1/2 x 12" mailers');
    expect(normalize('1½ in and 4 ½"')).toBe('1-1/2 in and 4-1/2"');
    expect(normalize('⅜ x ¾')).toBe('3/8 x 3/4');
  });

  it('makes quote marks and × plain, and spaces the x between dimensions',()=>{
    expect(normalize('4×6, 2”, 27’')).toBe('4 x 6, 2", 27\'');
    expect(normalize('12x10x8″')).toBe('12 x 10 x 8"');
    expect(normalize('12"x10"x8"')).toBe('12" x 10" x 8"');
  });
});

describe('stem',()=>{
  it.each([['boxes','box'],['mailers','mailer'],['pouches','pouch'],['brushes','brush'],['bags','bag'],['supplies','supply'],['glasses','glass'],['plus','plus'],['gas','gas'],['class','class']])('%s -> %s',(word,stemmed)=>{
    expect(stem(word)).toBe(stemmed);
  });
});
