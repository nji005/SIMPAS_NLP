import { Router } from 'express';
import {
  getAdminLaporan,
  patchAdminLaporan,
  selesaikanLaporan,
  getAdminUsers,
  patchAdminUsers,
  getAdminAnalytics,
} from './admin.controller';
import { authGuard } from '../../middlewares/authGuard';
import { roleGuard } from '../../middlewares/roleGuard';
import { analyticsLimiter } from '../../middlewares/rateLimiter';
import { validateUpload } from '../../middlewares/uploadValidator';
import {
  validate,
  patchLaporanStatusSchema,
  selesaikanLaporanSchema,
  patchUserRoleSchema,
} from '../../middlewares/validate';

const router = Router();

// Endpoint analitik / statistik agregat publik (tanpa data pribadi/PII, digunakan oleh halaman statistik publik & dashboard)
router.get('/analytics', analyticsLimiter, getAdminAnalytics);

// Proteksi data sensitif admin (laporan & manajemen pengguna): wajib login dan memiliki role ADMIN
router.use(authGuard, roleGuard('ADMIN'));

router.get('/laporan', getAdminLaporan);
router.patch('/laporan', validate(patchLaporanStatusSchema), patchAdminLaporan);
router.post(
  '/laporan/:id/selesai',
  validateUpload,
  validate(selesaikanLaporanSchema),
  selesaikanLaporan
);

router.get('/users', getAdminUsers);
router.patch('/users', validate(patchUserRoleSchema), patchAdminUsers);

export default router;

