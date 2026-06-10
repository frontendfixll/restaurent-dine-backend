import { Router } from 'express';
import { validate } from '@middleware/validate';
import { requireGuestToken } from '@middleware/requireGuestToken';
import * as ctrl from './guestOrder.controller';
import * as v from './order.validators';
import guestFeedbackRoutes from '@modules/feedback/guestFeedback.routes';

// Mounted at /api/v1/guest/orders — public (dine-in) or guest-token-gated (window).
const router = Router();

// Dine-in: anonymous, QR-bound.
router.post('/dine-in', validate(v.placeDineInGuestSchema), ctrl.placeDineIn);
router.post(
  '/:id/items',
  validate(v.idParamSchema, 'params'),
  validate(v.addItemsSchema),
  ctrl.addItems,
);

// Window: requires verified-phone guest token.
router.post(
  '/window',
  requireGuestToken,
  validate(v.placeWindowGuestSchema),
  ctrl.placeWindow,
);

// Status + guest pings (no auth — guest has the orderId in hand).
router.get('/:id', validate(v.idParamSchema, 'params'), ctrl.getStatus);
router.post(
  '/:id/requests',
  validate(v.idParamSchema, 'params'),
  validate(v.guestRequestSchema),
  ctrl.sendRequest,
);

// Guest feedback (post-served / post-settled).
router.use('/:id/feedback', guestFeedbackRoutes);

export default router;
