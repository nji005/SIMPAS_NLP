import { Router } from 'express';
import { createLaporan } from './laporan.controller';
import { authGuard } from '../../middlewares/authGuard';
import { validateUpload } from '../../middlewares/uploadValidator';
import { validate, createLaporanSchema } from '../../middlewares/validate';

const router = Router();

router.post('/', authGuard, validateUpload, validate(createLaporanSchema), createLaporan);

export default router;
