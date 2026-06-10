import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './loyalty.controller';
import * as v from './loyalty.validators';

const router = Router();
router.use(requireAuth);

router.get('/config', requirePermission('loyalty:read'), ctrl.getConfig);
router.patch('/config', requirePermission('loyalty:config'), validate(v.updateLoyaltyConfigSchema), ctrl.updateConfig);

router.get(
  '/accounts/:customerId',
  requirePermission('loyalty:read'),
  validate(v.customerIdParamSchema, 'params'),
  ctrl.getAccount,
);
router.post(
  '/accounts/:customerId/adjust',
  requirePermission('loyalty:config'),
  validate(v.customerIdParamSchema, 'params'),
  validate(v.adjustPointsSchema),
  ctrl.adjust,
);
router.post(
  '/redeem-preview',
  requirePermission('loyalty:redeem'),
  validate(v.previewRedeemSchema),
  ctrl.preview,
);

export default router;
