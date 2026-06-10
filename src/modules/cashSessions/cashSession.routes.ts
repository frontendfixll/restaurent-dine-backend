import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './cashSession.controller';
import * as v from './cashSession.validators';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('payment:read'),
  validate(v.listCashSessionsQuerySchema, 'query'),
  ctrl.list,
);
router.get('/current', requirePermission('payment:read'), ctrl.current);
router.post('/open', requirePermission('payment:create'), validate(v.openCashSessionSchema), ctrl.open);
router.post(
  '/:id/close',
  requirePermission('payment:create'),
  validate(v.idParamSchema, 'params'),
  validate(v.closeCashSessionSchema),
  ctrl.close,
);

export default router;
