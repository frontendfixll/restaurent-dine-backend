import { Router } from 'express';
import { validate } from '@middleware/validate';
import * as ctrl from './qrCode.controller';
import { slugParamSchema } from './qrCode.validators';

// Mounted at the app root (not /api/v1) — this is what QR images encode.
const router = Router();

router.get('/:slug', validate(slugParamSchema, 'params'), ctrl.publicRedirect);

export default router;
