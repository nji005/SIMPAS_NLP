import { Router } from 'express';
import { predictCategory } from './predict.controller';
import { predictLimiter } from '../../middlewares/rateLimiter';

const router = Router();

router.post('/', predictLimiter, predictCategory);

export default router;
