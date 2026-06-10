import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './feedback.controller';
import * as v from './feedback.validators';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('feedback:read'), validate(v.listFeedbackQuerySchema, 'query'), ctrl.list);
router.get('/summary', requirePermission('feedback:read'), validate(v.summaryQuerySchema, 'query'), ctrl.summary);
router.get('/:id', requirePermission('feedback:read'), validate(v.idParamSchema, 'params'), ctrl.getOne);
router.post(
  '/:id/acknowledge',
  requirePermission('feedback:reply'),
  validate(v.idParamSchema, 'params'),
  ctrl.acknowledge,
);
router.post(
  '/:id/reply',
  requirePermission('feedback:reply'),
  validate(v.idParamSchema, 'params'),
  validate(v.replySchema),
  ctrl.reply,
);

export default router;
