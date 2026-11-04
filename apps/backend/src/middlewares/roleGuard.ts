import { Request, Response, NextFunction } from 'express';

export function roleGuard(allowedRole: 'ADMIN' | 'WARGA') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Akses ditolak. Silakan masuk (login) terlebih dahulu.',
      });
    }

    if (req.user.role !== allowedRole) {
      return res.status(403).json({
        message: 'Akses ditolak. Anda tidak memiliki izin untuk mengakses resource ini.',
      });
    }

    next();
  };
}
