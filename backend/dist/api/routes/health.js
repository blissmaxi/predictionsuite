/**
 * Health Route
 *
 * GET /api/health - Health check endpoint
 */
import { Router } from 'express';
const router = Router();
router.get('/', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'polyoracle-api',
    });
});
export default router;
