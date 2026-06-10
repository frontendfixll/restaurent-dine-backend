import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './role.controller';
import * as v from './role.validators';

const router = Router();

router.use(requireAuth);

router.get('/permissions', requirePermission('role:read'), ctrl.permissions);
router.get('/', requirePermission('role:read'), ctrl.list);
router.get('/:id', requirePermission('role:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('role:create'), validate(v.createRoleSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('role:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateRoleSchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('role:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
