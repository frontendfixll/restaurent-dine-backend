import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './coupon.controller';
import * as v from './coupon.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('coupon:read'), validate(v.listCouponsQuerySchema, 'query'), ctrl.list);
router.post('/validate', requirePermission('discount:apply'), validate(v.validateCouponSchema), ctrl.validate);
router.get('/:id', requirePermission('coupon:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('coupon:create'), validate(v.createCouponSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('coupon:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateCouponSchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('coupon:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
