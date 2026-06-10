import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi';

const router = Router();

router.get('/openapi.json', (_req, res) => res.json(openApiSpec));

router.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'SmartDine API',
    swaggerOptions: { persistAuthorization: true },
  }),
);

export default router;
