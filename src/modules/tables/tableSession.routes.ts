import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './tableSession.controller';
import * as v from './tableSession.validators';

const router = Router();
router.use(requireAuth);

router.get('/open', requirePermission('table:read'), ctrl.listOpen);
router.post('/', requirePermission('table:update'), validate(v.openSessionSchema), ctrl.open);
router.get('/:id', requirePermission('table:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post(
  '/:id/close',
  requirePermission('table:update'),
  validate(v.idParamSchema, 'params'),
  ctrl.close,
);

export default router;
