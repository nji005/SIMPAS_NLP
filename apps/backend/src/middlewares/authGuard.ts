import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';

interface JwtPayload {
  id: number;
  email: string;
  role?: 'WARGA' | 'ADMIN';
  tv?: number;
  nama?: string;
}

export async function authGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        message: 'Konfigurasi server bermasalah: JWT_SECRET tidak ditemukan.',
      });
    }

    let token = req.cookies?.token;

    // Support Authorization: Bearer <token> as fallback
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        message: 'Akses ditolak. Silakan masuk (login) terlebih dahulu.',
      });
    }

    // 1. Verifikasi tanda tangan JWT dengan algoritma ketat HS256
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;

    if (!decoded || typeof decoded.id !== 'number') {
      return res.status(401).json({
        message: 'Akses ditolak. Token tidak valid.',
      });
    }

    // 2. Ambil data pengguna terkini dari DB untuk memastikan status aktif dan tokenVersion
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        isVerified: true,
        tokenVersion: true,
      },
    });

    if (!dbUser || !dbUser.isVerified) {
      return res.status(401).json({
        message: 'Akses ditolak. Pengguna tidak ditemukan atau belum diverifikasi.',
      });
    }

    // 3. Validasi tokenVersion: jika tv pada token berbeda dengan di DB, sesi telah dicabut
    if (decoded.tv === undefined || decoded.tv !== dbUser.tokenVersion) {
      return res.status(401).json({
        message: 'Akses ditolak. Sesi tidak valid atau telah berakhir.',
      });
    }

    // 4. Set req.user dengan role dan data langsung dari database (bukan percaya klaim token)
    req.user = {
      id: dbUser.id,
      nama: dbUser.nama,
      email: dbUser.email,
      role: dbUser.role,
      tokenVersion: dbUser.tokenVersion,
    };

    next();
  } catch (error) {
    logger.warn(
      {
        err: (error as Error)?.message,
        path: req.path,
        ip: req.ip,
      },
      'Akses autentikasi ditolak: Token JWT tidak valid atau telah kedaluwarsa'
    );
    return res.status(401).json({
      message: 'Akses ditolak. Sesi tidak valid atau telah berakhir.',
    });
  }
}
