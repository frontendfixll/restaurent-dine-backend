import { convert } from '../src/modules/inventory/units';

describe('inventory units.convert', () => {
  test('identity', () => {
    expect(convert(5, 'kg', 'kg')).toBe(5);
    expect(convert(10, 'pcs', 'pcs')).toBe(10);
  });

  test('kg → g', () => {
    expect(convert(1.5, 'kg', 'g')).toBe(1500);
  });

  test('g → kg', () => {
    expect(convert(250, 'g', 'kg')).toBe(0.25);
  });

  test('L → ml', () => {
    expect(convert(2, 'L', 'ml')).toBe(2000);
  });

  test('throws on incompatible groups', () => {
    expect(() => convert(1, 'kg', 'L')).toThrow(/Incompatible units/);
    expect(() => convert(1, 'pcs', 'g')).toThrow(/Incompatible units/);
  });
});
