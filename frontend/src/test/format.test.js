import { describe, it, expect } from 'vitest';
import { distance, fromPaise, money, moneyExact, moneyShort, percent, toPaise } from '../lib/format.js';

describe('lib/format.js', () => {
  it('converts paise to formatted INR string', () => {
    expect(money(50000)).toMatch(/₹\s*500/);
    expect(money(125000)).toMatch(/₹\s*1,250/);
    expect(money(0)).toMatch(/₹\s*0/);
  });

  it('converts paise to exact decimal rupees', () => {
    expect(moneyExact(125050)).toMatch(/₹\s*1,250\.50/);
  });

  it('formats short numbers for KPI cards', () => {
    expect(moneyShort(1200000000)).toBe('₹1.20Cr');
    expect(moneyShort(15000000)).toBe('₹1.50L');
    expect(moneyShort(500000)).toBe('₹5.0k');
    expect(moneyShort(45000)).toBe('₹450');
  });

  it('converts from rupee strings to paise integers and back safely', () => {
    expect(toPaise('12.50')).toBe(1250);
    expect(toPaise('500')).toBe(50000);
    expect(toPaise('abc')).toBe(0);
    expect(Number(fromPaise(50000))).toBe(500);
    expect(Number(fromPaise(1250))).toBe(12.5);
  });

  it('formats distance in metres and kilometres', () => {
    expect(distance(450)).toBe('450 m');
    expect(distance(2400)).toBe('2.4 km');
  });

  it('formats percentages', () => {
    expect(percent(23.456, 1)).toBe('23.5%');
    expect(percent(10, 0)).toBe('10%');
  });
});
