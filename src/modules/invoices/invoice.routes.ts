import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './invoice.controller';
import * as v from './invoice.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('billing:read'), validate(v.listInvoicesQuerySchema, 'query'), ctrl.list);
router.get('/:id', requirePermission('billing:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.get('/:id/pdf', requirePermission('billing:read'), validate(v.idParamSchema, 'params'), ctrl.downloadPdf);
router.post(
  '/:id/split',
  requirePermission('billing:create'),
  validate(v.idParamSchema, 'params'),
  validate(v.splitInvoiceSchema),
  ctrl.split,
);
router.patch(
  '/:id/discount',
  requirePermission('billing:discount'),
  validate(v.idParamSchema, 'params'),
  validate(v.applyDiscountSchema),
  ctrl.applyDiscount,
);
router.post(
  '/:id/void',
  requirePermission('billing:settle'),
  validate(v.idParamSchema, 'params'),
  validate(v.voidInvoiceSchema),
  ctrl.voidInvoice,
);

export default router;
