import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './category.controller';
import * as v from './category.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('menu:read'), validate(v.listCategoriesQuerySchema, 'query'), ctrl.list);
router.post('/reorder', requirePermission('menu:update'), validate(v.reorderCategoriesSchema), ctrl.reorder);
router.get('/:id', requirePermission('menu:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('menu:create'), validate(v.createCategorySchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('menu:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateCategorySchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('menu:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
