import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './modifierGroup.controller';
import * as v from './modifierGroup.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('menu:read'), ctrl.list);
router.get('/:id', requirePermission('menu:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('menu:create'), validate(v.createModifierGroupSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('menu:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateModifierGroupSchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('menu:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
