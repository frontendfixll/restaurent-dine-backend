import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './qrCode.controller';
import * as v from './qrCode.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('qr:read'), validate(v.listQrQuerySchema, 'query'), ctrl.list);
router.post('/bulk', requirePermission('qr:create'), validate(v.bulkQrSchema), ctrl.bulkCreate);
router.get('/:id', requirePermission('qr:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post('/', requirePermission('qr:create'), validate(v.createQrSchema), ctrl.create);
router.patch(
  '/:id',
  requirePermission('qr:update'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateQrSchema),
  ctrl.update,
);
router.post(
  '/:id/regenerate',
  requirePermission('qr:update'),
  validate(v.idParamSchema, 'params'),
  ctrl.regenerate,
);
router.delete(
  '/:id',
  requirePermission('qr:delete'),
  validate(v.idParamSchema, 'params'),
  ctrl.remove,
);
router.get(
  '/:id/analytics',
  requirePermission('qr:read'),
  validate(v.idParamSchema, 'params'),
  ctrl.analytics,
);
router.get(
  '/:id/png',
  requirePermission('qr:read'),
  validate(v.idParamSchema, 'params'),
  ctrl.downloadPng,
);
router.get(
  '/:id/svg',
  requirePermission('qr:read'),
  validate(v.idParamSchema, 'params'),
  ctrl.downloadSvg,
);
router.get(
  '/:id/pdf',
  requirePermission('qr:read'),
  validate(v.idParamSchema, 'params'),
  ctrl.downloadPdf,
);

export default router;
