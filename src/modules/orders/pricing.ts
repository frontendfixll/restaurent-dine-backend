import { OrderItem, OrderTotals } from './order.model';
import { RestaurantDocument } from '@modules/restaurant/restaurant.model';

export interface PricingInput {
  items: OrderItem[];
  restaurant: Pick<RestaurantDocument, 'tax'>;
  discount?: number;
}

export function computeTotals({ items, restaurant, discount = 0 }: PricingInput): OrderTotals {
  let subtotal = 0;
  let modifierTotal = 0;

  for (const it of items) {
    if (it.status === 'cancelled') {
      it.lineTotal = 0;
      continue;
    }
    const modSum = it.modifiers.reduce((s, m) => s + (m.priceDelta || 0), 0);
    const unit = it.basePrice + modSum;
    it.lineTotal = round2(unit * it.qty);
    subtotal += round2(it.basePrice * it.qty);
    modifierTotal += round2(modSum * it.qty);
  }

  subtotal = round2(subtotal);
  modifierTotal = round2(modifierTotal);

  const taxableBase = round2(subtotal + modifierTotal - discount);
  const serviceCharge = round2((taxableBase * (restaurant.tax.serviceChargePercent || 0)) / 100);

  const totalRate = restaurant.tax.taxes.reduce((s, t) => s + t.rate, 0);
  let taxBase: number;
  let tax: number;
  let taxBreakup: OrderTotals['taxBreakup'];

  if (restaurant.tax.taxInclusive && totalRate > 0) {
    // Prices already include tax: back out tax from taxable base + service charge
    const inclusive = taxableBase + serviceCharge;
    taxBase = round2(inclusive / (1 + totalRate / 100));
    tax = round2(inclusive - taxBase);
    taxBreakup = restaurant.tax.taxes.map((t) => ({
      name: t.name,
      type: t.type,
      rate: t.rate,
      amount: round2((tax * t.rate) / (totalRate || 1)),
    }));
  } else {
    taxBase = round2(taxableBase + serviceCharge);
    taxBreakup = restaurant.tax.taxes.map((t) => ({
      name: t.name,
      type: t.type,
      rate: t.rate,
      amount: round2((taxBase * t.rate) / 100),
    }));
    tax = round2(taxBreakup.reduce((s, t) => s + t.amount, 0));
  }

  const preRound = restaurant.tax.taxInclusive
    ? round2(taxableBase + serviceCharge)
    : round2(taxBase + tax);

  let grand = preRound;
  let roundOff = 0;
  if (restaurant.tax.roundingRule === 'nearest_rupee') {
    const rounded = Math.round(grand);
    roundOff = round2(rounded - grand);
    grand = rounded;
  } else if (restaurant.tax.roundingRule === 'nearest_50_paise') {
    const rounded = Math.round(grand * 2) / 2;
    roundOff = round2(rounded - grand);
    grand = round2(rounded);
  }

  return { subtotal, modifierTotal, discount, serviceCharge, tax, taxBreakup, roundOff, grand };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estimatePrepMinutes(items: OrderItem[], queueDepth = 0): number {
  if (!items.length) return 0;
  // Items at the same station are sequential; stations are parallel.
  const byStation = new Map<string, number>();
  for (const it of items) {
    if (it.status === 'cancelled') continue;
    const station = it.station || 'default';
    const itemTime = 10; // fallback; menu prep time is snapshotted later in Phase 6+
    byStation.set(station, (byStation.get(station) ?? 0) + itemTime * it.qty);
  }
  const longest = Math.max(0, ...Array.from(byStation.values()));
  return longest + queueDepth * 2;
}
