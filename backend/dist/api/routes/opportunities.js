/**
 * Opportunities Route
 *
 * GET /api/opportunities - Returns arbitrage opportunities
 */
import { Router } from 'express';
import { getOpportunities } from '../processors/opportunity.processor.js';
const router = Router();
router.get('/', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        const result = await getOpportunities(forceRefresh);
        res.json(result);
    }
    catch (error) {
        console.error('[OpportunitiesRoute] Error:', error);
        res.status(500).json({
            error: 'Failed to fetch opportunities',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
export default router;
