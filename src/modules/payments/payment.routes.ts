import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './payment.controller';
import * as v from './payment.validators';

const router = Router();

// Webhook — public, no auth. The global JSON middleware stashes `rawBody` on the
// request for HMAC verification in the controller.
router.post('/webhook/razorpay', ctrl.razorpayWebhook);

router.use(requireAuth);

router.get('/', requirePermission('payment:read'), validate(v.listPaymentsQuerySchema, 'query'), ctrl.list);
router.post('/upi/qr', requirePermission('payment:create'), validate(v.upiQrSchema), ctrl.upiQr);
router.post(
  '/invoices/:invoiceId',
  requirePermission('payment:create'),
  validate(v.invoiceIdParamSchema, 'params'),
  validate(v.recordPaymentSchema),
  ctrl.record,
);
router.post(
  '/:id/refund',
  requirePermission('payment:refund'),
  validate(v.idParamSchema, 'params'),
  validate(v.refundSchema),
  ctrl.refund,
);

export default router;
