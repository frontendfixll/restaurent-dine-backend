import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './discount.controller';
import * as v from './discount.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('discount:read'), validate(v.listDiscountsQuerySchema, 'query'), ctrl.list);
router.get('/:id', requirePermission('discount:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('discount:create'), validate(v.createDiscountSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('discount:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateDiscountSchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('discount:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
