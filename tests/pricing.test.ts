import { Types } from 'mongoose';
import { computeTotals } from '../src/modules/orders/pricing';
import type { OrderItem } from '../src/modules/orders/order.model';
import type { RestaurantDocument } from '../src/modules/restaurant/restaurant.model';

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    _id: new Types.ObjectId(),
    itemId: new Types.ObjectId(),
    name: 'Item',
    qty: 1,
    basePrice: 100,
    modifiers: [],
    lineTotal: 0,
    status: 'pending',
    ...overrides,
  } as OrderItem;
}

function makeRestaurant(overrides: Partial<RestaurantDocument['tax']> = {}) {
  return {
    tax: {
      gstin: undefined,
      taxes: [
        { name: 'CGST', rate: 2.5, type: 'cgst' as const, applyOn: 'subtotal' as const },
        { name: 'SGST', rate: 2.5, type: 'sgst' as const, applyOn: 'subtotal' as const },
      ],
      serviceChargePercent: 0,
      roundingRule: 'nearest_rupee' as const,
      taxInclusive: false,
      ...overrides,
    },
  } as Pick<RestaurantDocument, 'tax'>;
}

describe('computeTotals', () => {
  test('single item, no modifiers, default CGST+SGST 5%', () => {
    const totals = computeTotals({
      items: [makeItem({ qty: 2, basePrice: 100 })],
      restaurant: makeRestaurant(),
    });
    expect(totals.subtotal).toBe(200);
    expect(totals.tax).toBe(10);
    expect(totals.grand).toBe(210);
  });

  test('skips cancelled items', () => {
    const totals = computeTotals({
      items: [
        makeItem({ qty: 1, basePrice: 100 }),
        makeItem({ qty: 1, basePrice: 50, status: 'cancelled' }),
      ],
      restaurant: makeRestaurant(),
    });
    expect(totals.subtotal).toBe(100);
    expect(totals.grand).toBe(105);
  });

  test('applies service charge before tax', () => {
    const totals = computeTotals({
      items: [makeItem({ qty: 1, basePrice: 1000 })],
      restaurant: makeRestaurant({ serviceChargePercent: 10 }),
    });
    expect(totals.subtotal).toBe(1000);
    expect(totals.serviceCharge).toBe(100);
    // tax = 5% of (1000 + 100) = 55
    expect(totals.tax).toBe(55);
    expect(totals.grand).toBe(1155);
  });

  test('discount reduces taxable base', () => {
    const totals = computeTotals({
      items: [makeItem({ qty: 1, basePrice: 500 })],
      restaurant: makeRestaurant(),
      discount: 50,
    });
    expect(totals.discount).toBe(50);
    // (500 - 50) * 5% = 22.5
    expect(totals.tax).toBeCloseTo(22.5, 2);
    expect(totals.grand).toBe(473);
  });

  test('rounding-rule "nearest_rupee" rounds and tracks roundOff', () => {
    const totals = computeTotals({
      items: [makeItem({ qty: 1, basePrice: 99 })],
      restaurant: makeRestaurant(),
    });
    // Tax lines round half-up: CGST 2.5% of 99 = 2.475 → 2.48 (×2 = 4.96)
    // Pre-round grand = 103.96 → rounds to 104, roundOff +0.04
    expect(totals.grand).toBe(104);
    expect(totals.roundOff).toBeCloseTo(0.04, 2);
  });

  test('tax-inclusive backs tax out of grand', () => {
    const totals = computeTotals({
      items: [makeItem({ qty: 1, basePrice: 105 })],
      restaurant: makeRestaurant({ taxInclusive: true }),
    });
    // 105 already includes 5% tax → taxable = 100, tax = 5
    expect(totals.grand).toBe(105);
    expect(totals.tax).toBeCloseTo(5, 2);
  });

  test('modifier prices contribute to subtotal', () => {
    const totals = computeTotals({
      items: [
        makeItem({
          qty: 2,
          basePrice: 100,
          modifiers: [
            {
              groupId: new Types.ObjectId(),
              groupName: 'Extras',
              modifierId: new Types.ObjectId(),
              modifierName: 'Cheese',
              priceDelta: 30,
            },
          ],
        }),
      ],
      restaurant: makeRestaurant(),
    });
    expect(totals.subtotal).toBe(200);
    expect(totals.modifierTotal).toBe(60);
    expect(totals.tax).toBeCloseTo(13, 2);
    expect(totals.grand).toBe(273);
  });
});
