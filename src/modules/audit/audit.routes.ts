import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './audit.controller';
import * as v from './audit.validators';

const router = Router();

router.use(requireAuth);
router.get('/', requirePermission('audit:read'), validate(v.listAuditQuerySchema, 'query'), ctrl.list);

export default router;
