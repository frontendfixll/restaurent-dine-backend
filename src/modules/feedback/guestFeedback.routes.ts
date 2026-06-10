import { Router } from 'express';
import { validate } from '@middleware/validate';
import * as ctrl from './feedback.controller';
import * as v from './feedback.validators';

// Mounted on the guest order router as /:id/feedback — no auth.
const router = Router({ mergeParams: true });

router.post('/', validate(v.orderIdParamSchema, 'params'), validate(v.submitFeedbackSchema), ctrl.submitGuest);

export default router;
