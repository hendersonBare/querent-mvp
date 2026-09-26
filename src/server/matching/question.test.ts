import {describe,expect,it} from 'vitest';
import {NO_MATCH_QUESTION,clarifyingQuestion} from './question';

const item=(sku:string,description:string,keywords='')=>({sku,description,keywords});
const T1=item('W-T1','Cut-off wheel 4.5 x .045 x 7/8 in, Type 1');
const T27=item('W-T27','Cut-off wheel 4.5 x .045 x 7/8 in, Type 27');
const T27_THICK=item('W-T27-90','Cut-off wheel 4.5 x .090 x 7/8 in, Type 27');
const B2G8=item('B-2-G8','Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc');
const B2G5=item('B-2-G5','Hex cap screw 1/2-13 x 2 in, Grade 5, zinc plated');
const B112=item('B-112','Hex cap screw 1/2-13 x 1-1/2 in, Grade 8, yellow zinc');
const B3=item('B-3','Hex cap screw 1/2-13 x 3 in, Grade 8, yellow zinc');
const NUT=item('N-G8','Hex nut 1/2-13, Grade 8, yellow zinc');
const S27=item('S-27','Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks');
const S30=item('S-30','Ratchet strap 2 in x 30 ft, 3,333 lb WLL, flat hooks');
const S4=item('S-4-30','Ratchet strap 4 in x 30 ft, 5,400 lb WLL, flat hooks');
const glove=(size:string)=>item(`G-${size}`,`Nitrile disposable gloves, 8 mil, black, size ${size}`);

/** Candidates best first; `tied` all score 1, `rest` trail well behind. */
const ask=(tied:ReturnType<typeof item>[],rest:ReturnType<typeof item>[]=[])=>clarifyingQuestion([...tied.map(i=>({item:i,score:1})),...rest.map(i=>({item:i,score:0.4}))]);

describe('clarifyingQuestion',()=>{
  it('names the attribute that separates the contenders, in the golden script\'s words',()=>{
    expect(ask([T1,T27])).toBe('Type 1 or Type 27 cut-off wheels?');
    expect(ask([T27,T1])).toBe('Type 1 or Type 27 cut-off wheels?');
  });

  it('asks about grade before finish, and lists sizes smallest first',()=>{
    expect(ask([B2G8,B2G5])).toBe('Grade 5 or Grade 8 hex cap screws?');
    expect(ask([B3,B2G8,B112])).toBe('1-1/2 in, 2 in or 3 in hex cap screws?');
  });

  it('asks about the size that differs, before hooks and load rating',()=>{
    expect(ask([S27,S30])).toBe('27 ft or 30 ft ratchet straps?');
    expect(ask([S30,S4])).toBe('2 in or 4 in ratchet straps?');
    expect(ask([T27,T27_THICK])).toBe('.045 in or .090 in cut-off wheels?');
  });

  it('asks which product when the contenders are different products, the most common first',()=>{
    expect(ask([B2G8,NUT])).toBe('Hex cap screws or hex nuts?');
    const cut=item('G-CR','Cut-resistant gloves, ANSI A4, size L');
    expect(ask([cut,glove('L'),glove('M')])).toBe('Nitrile disposable gloves or cut-resistant gloves?');
  });

  it('asks type first when type, diameter and thickness all differ',()=>{
    const six=item('W6-T1','Cut-off wheel 6 x .045 x 7/8 in, Type 1');
    expect(ask([T1,T27,six,T27_THICK])).toBe('Type 1 or Type 27 cut-off wheels?');
  });

  it('puts glove sizes in size order and colors in the order found',()=>{
    expect(ask([glove('XL'),glove('L'),glove('M')])).toBe('Size M, size L or size XL nitrile disposable gloves?');
    expect(ask([item('C','Safety glasses, clear anti-fog'),item('S','Safety glasses, smoke anti-fog')])).toBe('Clear or smoke safety glasses?');
  });

  it('only asks about the contenders, not items well behind them',()=>{
    expect(ask([T1,T27],[B2G5,S30])).toBe('Type 1 or Type 27 cut-off wheels?');
  });

  it('asks to confirm a lone candidate that is not a sure match',()=>{
    expect(clarifyingQuestion([{item:NUT,score:0.6},{item:B2G8,score:0.3}])).toBe('Did you mean Hex nut 1/2-13, Grade 8, yellow zinc (N-G8)?');
  });

  it('lists the items when nothing it can name separates them',()=>{
    const a=item('DEG-A','Heavy-duty degreaser'),b=item('DEG-B','Heavy-duty degreaser');
    expect(ask([a,b])).toBe('Which one do you mean: Heavy-duty degreaser (DEG-A) or Heavy-duty degreaser (DEG-B)?');
  });

  it('falls back to an attribute only some contenders have, when it still names two choices',()=>{
    const plain=item('B-PLAIN','Hex cap screw 1/2-13 x 2 in');
    expect(ask([B2G8,B2G5,plain])).toBe('Grade 5 or Grade 8 hex cap screws?');
    expect(ask([B2G8,plain])).toBe('Which one do you mean: Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc (B-2-G8) or Hex cap screw 1/2-13 x 2 in (B-PLAIN)?');
  });

  it('asks for another description when nothing matched',()=>{
    expect(clarifyingQuestion([])).toBe(NO_MATCH_QUESTION);
    expect(NO_MATCH_QUESTION).toBe("I couldn't find that item. Can you describe it another way, or give the SKU?");
  });
});
