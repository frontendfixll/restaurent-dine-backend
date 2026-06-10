import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './inventory.controller';
import * as v from './inventory.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('inventory:read'), validate(v.listInventoryQuerySchema, 'query'), ctrl.list);
router.get('/low-stock', requirePermission('inventory:read'), ctrl.lowStock);
router.get('/snapshot', requirePermission('inventory:read'), ctrl.snapshot);
router.get('/movements', requirePermission('inventory:read'), validate(v.listMovementsQuerySchema, 'query'), ctrl.allMovements);
router.get('/:id', requirePermission('inventory:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.get(
  '/:id/movements',
  requirePermission('inventory:read'),
  validate(v.idParamSchema, 'params'),
  validate(v.listMovementsQuerySchema, 'query'),
  ctrl.movements,
);
router.post('/', requirePermission('inventory:create'), validate(v.createInventorySchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('inventory:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateInventorySchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('inventory:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);
router.post(
  '/:id/stock-in',
  requirePermission('inventory:stockin'),
  validate(v.idParamSchema, 'params'),
  validate(v.stockInSchema),
  ctrl.stockIn,
);
router.post(
  '/:id/stock-out',
  requirePermission('inventory:stockout'),
  validate(v.idParamSchema, 'params'),
  validate(v.stockOutSchema),
  ctrl.stockOut,
);
router.post(
  '/:id/adjust',
  requirePermission('inventory:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.adjustSchema),
  ctrl.adjust,
);

export default router;
