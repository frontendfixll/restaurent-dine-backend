import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import { generateForOrder } from '@modules/invoices/invoice.controller';
import { generateInvoiceSchema, orderIdParamSchema } from '@modules/invoices/invoice.validators';
import * as dayCloseCtrl from './dayClose.controller';

const router = Router();
router.use(requireAuth);

// Generate (or refresh) an invoice from an order.
router.post(
  '/orders/:id/bill',
  requirePermission('billing:create'),
  validate(orderIdParamSchema, 'params'),
  validate(generateInvoiceSchema),
  generateForOrder,
);

// Day-close
router.get('/day-close/preview', requirePermission('day:close'), dayCloseCtrl.preview);
router.post('/day-close', requirePermission('day:close'), dayCloseCtrl.close);

export default router;
