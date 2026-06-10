import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './customer.controller';
import * as v from './customer.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('customer:read'), validate(v.listCustomersQuerySchema, 'query'), ctrl.list);
router.post('/lookup', requirePermission('customer:read'), validate(v.lookupSchema), ctrl.lookup);
router.get('/:id', requirePermission('customer:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.get(
  '/:id/history',
  requirePermission('customer:read'),
  validate(v.idParamSchema, 'params'),
  validate(v.historyQuerySchema, 'query'),
  ctrl.history,
);
router.post('/', requirePermission('customer:update'), validate(v.createCustomerSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('customer:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateCustomerSchema),
  ctrl.update,
);
router.post(
  '/:id/tags',
  requirePermission('customer:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.tagSchema),
  ctrl.addTag,
);
router.delete(
  '/:id/tags/:tag',
  requirePermission('customer:update'),
  validate(v.tagParamSchema, 'params'),
  ctrl.removeTag,
);

export default router;
