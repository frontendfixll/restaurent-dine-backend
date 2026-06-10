import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './order.controller';
import * as v from './order.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('order:read'), validate(v.listOrdersQuerySchema, 'query'), ctrl.list);
router.post('/', requirePermission('order:create'), validate(v.placeAssistedSchema), ctrl.placeAssisted);
router.post(
  '/window/token-scan',
  requirePermission('order:accept'),
  validate(v.windowTokenScanSchema),
  ctrl.tokenScan,
);
router.get('/:id', requirePermission('order:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.patch(
  '/:id/accept',
  requirePermission('order:accept'),
  validate(v.idParamSchema, 'params'),
  ctrl.accept,
);
router.post(
  '/:id/items',
  requirePermission('order:create'),
  validate(v.idParamSchema, 'params'),
  validate(v.addItemsSchema),
  ctrl.addItems,
);
router.patch(
  '/:id/items/:itemId/void',
  requirePermission('order:void'),
  validate(v.orderItemParamSchema, 'params'),
  validate(v.voidItemSchema),
  ctrl.voidItem,
);
router.post(
  '/:id/cancel',
  requirePermission('order:cancel'),
  validate(v.idParamSchema, 'params'),
  validate(v.cancelOrderSchema),
  ctrl.cancel,
);
router.post(
  '/:id/serve',
  requirePermission('order:accept'),
  validate(v.idParamSchema, 'params'),
  ctrl.serve,
);
router.post(
  '/:id/requests/:requestId/resolve',
  requirePermission('order:read'),
  validate(v.requestParamSchema, 'params'),
  ctrl.resolveRequest,
);

export default router;
