import { Router } from 'express';
import { getMonitoringHtml, getStatusJson } from './monitoring.controller';
import { authGuard } from '../../middlewares/authGuard';
import { roleGuard } from '../../middlewares/roleGuard';

const router = Router();

// Endpoint monitoring diproteksi: hanya ADMIN yang berhak mengakses
// CSP dinonaktifkan khusus pada HTML monitoring agar inline script/style dan font termuat sempurna
router.get(
  '/',
  authGuard,
  roleGuard('ADMIN'),
  (_req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    next();
  },
  getMonitoringHtml
);
router.get('/api/status', authGuard, roleGuard('ADMIN'), getStatusJson);

export default router;
