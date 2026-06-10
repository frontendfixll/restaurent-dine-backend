import { rupeesToWords } from '../src/utils/numberToWords';

describe('rupeesToWords (Indian numbering)', () => {
  test('zero', () => {
    expect(rupeesToWords(0)).toBe('Zero Rupees Only');
  });

  test('with paise', () => {
    expect(rupeesToWords(123.45)).toBe(
      'One Hundred Twenty Three Rupees and Forty Five Paise Only',
    );
  });

  test('handles thousands', () => {
    expect(rupeesToWords(12345)).toBe(
      'Twelve Thousand Three Hundred Forty Five Rupees Only',
    );
  });

  test('handles lakh and crore (Indian numbering)', () => {
    expect(rupeesToWords(1_25_000)).toBe('One Lakh Twenty Five Thousand Rupees Only');
    expect(rupeesToWords(2_50_00_000)).toBe('Two Crore Fifty Lakh Rupees Only');
  });

  test('negative amount', () => {
    expect(rupeesToWords(-50)).toMatch(/^Minus /);
  });
});
