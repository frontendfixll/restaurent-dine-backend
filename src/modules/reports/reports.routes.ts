import { Router } from 'express';
import { requireAuth } from '@middleware/requireAuth';
import { requirePermission } from '@middleware/requirePermission';
import { validate } from '@middleware/validate';
import * as ctrl from './reports.controller';
import * as v from './reports.validators';

const router = Router();
router.use(requireAuth);

router.get('/kpi-dashboard', requirePermission('report:read'), ctrl.kpi);
router.get('/sales', requirePermission('report:read'), validate(v.salesQuerySchema, 'query'), ctrl.sales);
router.get('/items', requirePermission('report:read'), validate(v.itemsQuerySchema, 'query'), ctrl.items);
router.get('/tax', requirePermission('report:read'), validate(v.baseRange, 'query'), ctrl.tax);
router.get('/payments', requirePermission('report:read'), validate(v.baseRange, 'query'), ctrl.payments);
router.get('/staff', requirePermission('report:read'), validate(v.baseRange, 'query'), ctrl.staff);
router.get('/footfall', requirePermission('report:read'), validate(v.baseRange, 'query'), ctrl.footfall);
router.get('/inventory', requirePermission('report:read'), validate(v.baseRange, 'query'), ctrl.inventory);
router.get('/feedback', requirePermission('report:read'), validate(v.baseRange, 'query'), ctrl.feedback);
router.get('/profitability', requirePermission('report:read'), validate(v.baseRange, 'query'), ctrl.profitability);

router.get(
  '/:type/export',
  requirePermission('report:export'),
  validate(v.exportParamSchema, 'params'),
  ctrl.exportReport,
);

export default router;
