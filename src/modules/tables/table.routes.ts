import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './table.controller';
import * as v from './table.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('table:read'), validate(v.listTablesQuerySchema, 'query'), ctrl.list);
router.post('/bulk', requirePermission('table:create'), validate(v.bulkCreateTablesSchema), ctrl.bulkCreate);
router.get('/:id', requirePermission('table:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('table:create'), validate(v.createTableSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('table:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateTableSchema),
  ctrl.update,
);
router.delete(
  '/:id',
  requirePermission('table:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);
router.patch(
  '/:id/status',
  requirePermission('table:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.transitionStatusSchema),
  ctrl.transition,
);
router.post(
  '/:id/merge',
  requirePermission('table:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.mergeTablesSchema),
  ctrl.merge,
);
router.post(
  '/:id/split',
  requirePermission('table:update'),
  validate(v.idParamSchema, 'params'),
  ctrl.split,
);
router.post(
  '/:id/move',
  requirePermission('table:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.moveSessionSchema),
  ctrl.move,
);

export default router;
