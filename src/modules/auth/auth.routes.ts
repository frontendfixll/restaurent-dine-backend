import { Router } from 'express';
import { validate } from '@middleware/validate';
import { requireAuth } from '@middleware/requireAuth';
import * as ctrl from './auth.controller';
import * as v from './auth.validators';

const router = Router();

// Staff
router.post('/staff/login', validate(v.staffLoginSchema), ctrl.staffLogin);
router.post('/staff/2fa/verify', validate(v.staffVerify2faSchema), ctrl.staffVerify2fa);
router.post('/staff/refresh', validate(v.refreshSchema), ctrl.refresh);
router.post('/staff/logout', validate(v.logoutSchema), requireAuth, ctrl.logout);

router.get('/me', requireAuth, ctrl.me);
router.post('/staff/2fa/setup', requireAuth, validate(v.setup2faSchema), ctrl.setup2fa);
router.post('/staff/2fa/confirm', requireAuth, validate(v.confirm2faSchema), ctrl.confirm2fa);
router.post('/staff/2fa/disable', requireAuth, ctrl.disable2fa);

// Guest
router.post('/guest/otp/request', validate(v.guestOtpRequestSchema), ctrl.requestGuestOtp);
router.post('/guest/otp/verify', validate(v.guestOtpVerifySchema), ctrl.verifyGuestOtp);

export default router;
