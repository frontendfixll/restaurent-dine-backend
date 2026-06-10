import { InventoryUnit } from './inventoryItem.model';

const FACTORS: Record<string, number> = {
  kg: 1000,
  g: 1,
  L: 1000,
  ml: 1,
  pcs: 1,
};

const GROUP: Record<InventoryUnit, 'mass' | 'volume' | 'count'> = {
  kg: 'mass',
  g: 'mass',
  L: 'volume',
  ml: 'volume',
  pcs: 'count',
};

/**
 * Convert `qty` from `fromUnit` to `toUnit`. Throws if dimensionally incompatible
 * (e.g., kg → L). Returns the converted number.
 */
export function convert(qty: number, fromUnit: InventoryUnit, toUnit: InventoryUnit): number {
  if (fromUnit === toUnit) return qty;
  if (GROUP[fromUnit] !== GROUP[toUnit]) {
    throw new Error(`Incompatible units: ${fromUnit} -> ${toUnit}`);
  }
  return (qty * FACTORS[fromUnit]) / FACTORS[toUnit];
}
