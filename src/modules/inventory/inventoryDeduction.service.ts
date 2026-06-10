import { Types } from 'mongoose';
import { OrderModel } from '@modules/orders/order.model';
import { InventoryItemModel } from './inventoryItem.model';
import { StockMovementModel } from './stockMovement.model';
import { findRecipeFor } from './recipe.service';
import { convert } from './units';
import { getIo } from '@sockets/index';
import { logger } from '@utils/logger';
import { writeAuditLog } from '@modules/audit/audit.service';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function emitLowStock(payload: unknown) {
  try {
    getIo().of('/staff').emit('inventory:low_stock', payload);
  } catch (err) {
    logger.debug({ err }, 'Skip low-stock broadcast');
  }
}

/**
 * Walk an order's items, apply recipe-based deduction to InventoryItem stock,
 * and log each as a StockMovement of type "recipe_deduction".
 *
 * Idempotent: if any recipe_deduction already exists for this order, skips.
 * Designed to be called when an order transitions to "settled".
 */
export async function deductOrderInventory(orderId: Types.ObjectId | string): Promise<{
  processed: number;
  skipped: number;
  alerts: number;
}> {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) return { processed: 0, skipped: 0, alerts: 0 };

  const already = await StockMovementModel.exists({
    orderId: order._id,
    type: 'recipe_deduction',
  });
  if (already) {
    logger.debug({ orderId: String(order._id) }, 'Inventory deduction already processed');
    return { processed: 0, skipped: order.items.length, alerts: 0 };
  }

  let processed = 0;
  let skipped = 0;
  let alerts = 0;

  for (const oi of order.items) {
    if (oi.status === 'cancelled') {
      skipped++;
      continue;
    }
    if (!oi.itemId) {
      // Combos and ad-hoc lines don't have recipes in v1; skip.
      skipped++;
      continue;
    }

    const ingredients = await findRecipeFor(oi.itemId, oi.variantId);
    if (!ingredients || !ingredients.length) {
      skipped++;
      continue;
    }

    for (const ing of ingredients) {
      const inv = await InventoryItemModel.findById(ing.inventoryItemId);
      if (!inv) {
        logger.warn(
          { orderId: String(order._id), inventoryItemId: String(ing.inventoryItemId) },
          'Recipe references missing inventory item',
        );
        continue;
      }

      let qtyInItemUnit: number;
      try {
        qtyInItemUnit = convert(ing.qty * oi.qty, ing.unit, inv.unit);
      } catch (err) {
        logger.error({ err, inv: inv.name, recipe: ing }, 'Unit conversion failed during deduction');
        continue;
      }

      inv.currentStock = round3(inv.currentStock - qtyInItemUnit);
      await inv.save();

      await StockMovementModel.create({
        inventoryItemId: inv._id,
        type: 'recipe_deduction',
        qty: -round3(qtyInItemUnit),
        unit: inv.unit,
        reason: `Order ${order.orderNumber} — ${oi.name}${oi.variantName ? ` (${oi.variantName})` : ''}`,
        orderId: order._id,
        resultingStock: inv.currentStock,
      });

      if (inv.currentStock <= inv.lowStockThreshold) {
        emitLowStock({
          id: String(inv._id),
          name: inv.name,
          currentStock: inv.currentStock,
          threshold: inv.lowStockThreshold,
          unit: inv.unit,
        });
        alerts++;
      }

      processed++;
    }
  }

  await writeAuditLog({
    action: 'inventory.deduct.order',
    entity: 'Order',
    entityId: String(order._id),
    metadata: { processed, skipped, alerts, orderNumber: order.orderNumber },
  });

  return { processed, skipped, alerts };
}
