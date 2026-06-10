import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import { uploadImage, requireCloudinary } from '@middleware/upload';
import * as ctrl from './item.controller';
import * as v from './item.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('menu:read'), validate(v.listItemsQuerySchema, 'query'), ctrl.list);
router.post('/bulk-price', requirePermission('menu:update'), validate(v.bulkPriceSchema), ctrl.bulkPrice);
router.get('/:id', requirePermission('menu:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('menu:create'), validate(v.createItemSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('menu:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateItemSchema),
  ctrl.update,
);
router.patch(
  '/:id/86',
  requirePermission('menu:86'),
  validate(v.idParamSchema, 'params'),
  validate(v.toggle86Schema),
  ctrl.toggle86,
);
router.post(
  '/:id/image',
  requirePermission('menu:update'),
  requireCloudinary,
  validate(v.idParamSchema, 'params'),
  uploadImage.single('image'),
  ctrl.uploadImage,
);
router.delete(
  '/:id',
  requirePermission('menu:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);

export default router;
