import { Router } from 'express';
import { getRiwayat, getRiwayatDetail } from './riwayat.controller';
import { authGuard } from '../../middlewares/authGuard';

const router = Router();

router.get('/', authGuard, getRiwayat);
router.get('/:id', authGuard, getRiwayatDetail);

export default router;
