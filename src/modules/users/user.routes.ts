import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './user.controller';
import * as v from './user.validators';

const router = Router();

router.use(requireAuth);

router.get('/', requirePermission('user:read'), validate(v.listUsersQuerySchema, 'query'), ctrl.list);
router.get('/:id', requirePermission('user:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('user:create'), validate(v.createUserSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('user:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateUserSchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('user:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
