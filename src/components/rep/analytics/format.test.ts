import {describe,expect,it} from 'vitest';
import {formatCount,formatDuration,formatGpAmount,formatHours,formatMoneyFigure,formatPercent,formatShortDays,formatWeek,niceTicks,plural} from './format';

describe('analytics number formats',()=>{
  it('formats durations in minutes, hours and minutes, or days',()=>{
    expect(formatDuration(null)).toBe('-'); // C_AN6 draws a hyphen for no value (no em-dashes, Appendix E)
    expect(formatDuration(0.4)).toBe('<1 min');
    expect(formatDuration(35)).toBe('35 min');
    expect(formatDuration(59.6)).toBe('1 h');
    expect(formatDuration(92.5)).toBe('1 h 33 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(1439)).toBe('23 h 59 min');
    expect(formatDuration(1440)).toBe('1.0 days');
    expect(formatDuration(3300)).toBe('2.3 days');
  });

  it('formats the leaderboard\'s "In sent" column with a short day unit, as C_AN6 draws it ("4.6 d")',()=>{
    expect(formatShortDays(null)).toBe('-');
    expect(formatShortDays(92.5)).toBe('1 h 33 min');
    expect(formatShortDays(6624)).toBe('4.6 d');
  });

  it('formats rates as whole percents, and nothing as a dash',()=>{
    expect(formatPercent(17/24)).toBe('71%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('-');
  });

  it('shows dollars to the cent under $1,000 and whole dollars above',()=>{
    expect(formatMoneyFigure(0)).toBe('$0.00');
    expect(formatMoneyFigure(10.2)).toBe('$10.20');
    expect(formatMoneyFigure(999.994)).toBe('$999.99');
    expect(formatMoneyFigure(9045.35)).toBe('$9,045');
    expect(formatMoneyFigure(1234567.8)).toBe('$1,234,568');
    expect(formatGpAmount(10.2)).toBe('+$10.20');
    expect(formatGpAmount(0)).toBe('$0.00');
  });

  it('formats hours, counts, weeks and plurals',()=>{
    expect(formatHours(8)).toBe('8.0');
    expect(formatHours(80/60)).toBe('1.3');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatWeek('2026-09-21')).toBe('Sep 21');
    expect(plural(1,'quote')).toBe('1 quote');
    expect(plural(24,'quote')).toBe('24 quotes');
    expect(plural(0,'line')).toBe('0 lines');
  });

  it('picks whole-number axis ticks from zero',()=>{
    expect(niceTicks(0)).toEqual([0,1]);
    expect(niceTicks(1)).toEqual([0,1]);
    expect(niceTicks(2)).toEqual([0,1,2]);
    expect(niceTicks(5)).toEqual([0,1,2,3,4,5]);
    expect(niceTicks(7)).toEqual([0,2,4,6,8]);
    expect(niceTicks(19)).toEqual([0,5,10,15,20]);
    expect(niceTicks(33)).toEqual([0,10,20,30,40]);
  });
});
