import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './recipe.controller';
import * as v from './recipe.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('inventory:read'), validate(v.listRecipesQuerySchema, 'query'), ctrl.list);
router.get('/:id', requirePermission('inventory:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('inventory:create'), validate(v.createRecipeSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('inventory:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateRecipeSchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('inventory:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
