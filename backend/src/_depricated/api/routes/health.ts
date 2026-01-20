/**
 * Health Route
 *
 * GET /api/health - Health check endpoint
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'polyoracle-api',
  });
});

export default router;
