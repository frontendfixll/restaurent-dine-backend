import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import { uploadSpreadsheet } from '@middleware/upload';
import * as ctrl from './menuMeta.controller';
import { publicMenuQuerySchema } from './publicMenu.validators';

const router = Router();

// Public — no auth (guest QR flow consumes this)
router.get('/public', validate(publicMenuQuerySchema, 'query'), ctrl.publicMenu);

// Staff — auth + permission
router.post(
  '/import',
  requireAuth,
  requirePermission('menu:import'),
  uploadSpreadsheet.single('file'),
  ctrl.importHandler,
);
router.get('/export', requireAuth, requirePermission('menu:export'), ctrl.exportHandler);

export default router;
