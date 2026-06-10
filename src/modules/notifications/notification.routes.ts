import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './notification.controller';
import * as v from './notification.validators';

const router = Router();
router.use(requireAuth);

router.get('/events', requirePermission('notification:read'), ctrl.events);

router.get(
  '/templates',
  requirePermission('notification:read'),
  validate(v.listTemplatesQuerySchema, 'query'),
  ctrl.listTemplates,
);
router.get(
  '/templates/:id',
  requirePermission('notification:read'),
  validate(v.idParamSchema, 'params'),
  ctrl.getTemplate,
);
router.post(
  '/templates',
  requirePermission('notification:template'),
  validate(v.createTemplateSchema),
  ctrl.createTemplate,
);
router.patch(
  '/templates/:id',
  requirePermission('notification:template'),
  validate(v.idParamSchema, 'params'),
  validate(v.updateTemplateSchema),
  ctrl.updateTemplate,
);
router.delete(
  '/templates/:id',
  requirePermission('notification:template'),
  validate(v.idParamSchema, 'params'),
  ctrl.deleteTemplate,
);

router.post(
  '/templates/preview',
  requirePermission('notification:template'),
  validate(v.previewSchema),
  ctrl.preview,
);

router.post(
  '/test',
  requirePermission('notification:send'),
  validate(v.testSendSchema),
  ctrl.testSend,
);

router.get(
  '/logs',
  requirePermission('notification:read'),
  validate(v.listLogsQuerySchema, 'query'),
  ctrl.listLogs,
);

export default router;
