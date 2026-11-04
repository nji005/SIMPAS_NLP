import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import prisma from './lib/prisma';
import authRoutes from './modules/auth/auth.routes';
import laporanRoutes from './modules/laporan/laporan.routes';
import riwayatRoutes from './modules/riwayat/riwayat.routes';
import predictRoutes from './modules/predict/predict.routes';
import adminRoutes from './modules/admin/admin.routes';
import monitoringRoutes from './modules/monitoring/monitoring.routes';

import { corsOriginChecker } from './middlewares/corsOriginChecker';
import { authGuard } from './middlewares/authGuard';
import { logger } from './lib/logger';
import { initSentry, captureException } from './lib/sentry';
import { storageService } from './services/storageService';

// Initialize optional Sentry (only active if SENTRY_DSN is provided)
initSentry();

const app = express();
const port = process.env.PORT || 5001;

// Trust proxy for rate limiting only when TRUST_PROXY env is explicitly defined (number of hops)
if (process.env.TRUST_PROXY) {
  const trustHops = parseInt(process.env.TRUST_PROXY, 10);
  app.set('trust proxy', isNaN(trustHops) ? process.env.TRUST_PROXY : trustHops);
}

// Security headers with helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts:
      process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
  })
);

// Middlewares
app.use(
  cors({
    origin: corsOriginChecker,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint terproteksi untuk foto upload: hanya ADMIN atau pemilik aduan yang berhak mengakses
app.get('/uploads/:filename', authGuard, async (req, res) => {
  try {
    const rawFilename = req.params.filename;
    const filename = path.basename(rawFilename);

    if (filename !== rawFilename || filename.includes('..')) {
      return res.status(404).json({ message: 'File tidak ditemukan.' });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Akses ditolak. Silakan login terlebih dahulu.' });
    }

    // Role ADMIN memiliki hak akses penuh ke seluruh foto laporan
    let isAuthorized = user.role === 'ADMIN';

    if (!isAuthorized) {
      // Warga hanya boleh mengakses foto aduan atau foto bukti selesai milik dirinya sendiri
      const expectedFotoPath = `/uploads/${filename}`;
      const laporan = await prisma.laporan.findFirst({
        where: {
          userId: user.id,
          OR: [
            { foto: expectedFotoPath },
            { fotoSelesai: expectedFotoPath },
          ],
        },
        select: { id: true },
      });
      if (laporan) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(404).json({ message: 'File tidak ditemukan.' });
    }

    // Set cache header private
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // 1. Cek penyimpanan disk lokal
    const localFilePath = path.join(process.cwd(), 'public/uploads', filename);
    if (fs.existsSync(localFilePath)) {
      return res.sendFile(localFilePath);
    }

    // 2. Fallback: Streaming dari MinIO jika file tidak ditemukan di disk lokal
    const streamData = await storageService.getObjectStream(filename);
    if (streamData) {
      if (streamData.contentType) {
        res.setHeader('Content-Type', streamData.contentType);
      }
      return streamData.stream.pipe(res);
    }

    return res.status(404).json({ message: 'File tidak ditemukan.' });
  } catch (err) {
    logger.error({ err }, 'Error saat melayani akses file upload');
    return res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

// Mount Routes
app.use('/', monitoringRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/riwayat', riwayatRoutes);
app.use('/api/predict', predictRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && err.message === 'Not allowed by CORS') {
    logger.warn({ origin: req.headers.origin, path: req.path }, 'Permintaan ditolak oleh CORS');
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }

  // Structured logging for unhandled server error
  logger.error(
    {
      err: {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      },
      method: req.method,
      path: req.path,
      ip: req.ip,
    },
    'Unhandled server error occurred'
  );

  // Send exception to Sentry if configured
  captureException(err);

  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan pada server.' : err?.message || 'Server error',
  });
});

// Startup validation: ensure JWT_SECRET is configured
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  logger.fatal('FATAL: JWT_SECRET environment variable is not defined.');
  process.exit(1);
}

app.listen(port, () => {
  logger.info(`Backend Express server listening on http://localhost:${port}`);
});

export default app;
