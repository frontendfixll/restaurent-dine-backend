import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import { uploadImage, requireCloudinary } from '@middleware/upload';
import * as ctrl from './restaurant.controller';
import { updateRestaurantSchema } from './restaurant.validators';

const router = Router();

router.get('/', requireAuth, requirePermission('restaurant:read'), ctrl.getRestaurant);

router.patch(
  '/',
  requireAuth,
  requirePermission('restaurant:update'),
  validate(updateRestaurantSchema),
  ctrl.updateRestaurant,
);

router.post(
  '/logo',
  requireAuth,
  requirePermission('restaurant:update'),
  requireCloudinary,
  uploadImage.single('logo'),
  ctrl.uploadLogo,
);

export default router;
