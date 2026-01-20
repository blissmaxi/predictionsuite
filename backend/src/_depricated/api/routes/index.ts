/**
 * Route Aggregator
 *
 * Combines all API routes.
 */

import { Router } from 'express';
import opportunitiesRouter from './opportunities.js';
import healthRouter from './health.js';

const router = Router();

router.use('/opportunities', opportunitiesRouter);
router.use('/health', healthRouter);

export default router;
