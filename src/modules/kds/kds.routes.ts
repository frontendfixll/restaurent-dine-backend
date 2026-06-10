import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './kds.controller';
import * as v from './kds.validators';

const router = Router();
router.use(requireAuth);

router.get('/queue', requirePermission('kds:read'), validate(v.queueQuerySchema, 'query'), ctrl.queue);
router.get('/snapshot', requirePermission('kds:read'), ctrl.snapshot);
router.patch(
  '/orders/:orderId/items/:itemId/status',
  requirePermission('kds:update'),
  validate(v.orderItemParamSchema, 'params'),
  validate(v.itemStatusSchema),
  ctrl.updateItem,
);
router.get(
  '/orders/:orderId/recall',
  requirePermission('kds:read'),
  validate(v.orderIdParamSchema, 'params'),
  ctrl.recall,
);

export default router;
