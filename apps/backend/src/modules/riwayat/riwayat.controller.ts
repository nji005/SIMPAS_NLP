import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';

export async function getRiwayat(req: Request, res: Response) {
  try {
    // Ambil userId dari token terverifikasi di server (req.user), hilangkan celah IDOR!
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Akses ditolak. Silakan login terlebih dahulu." });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string, 10) || 500));
    const skip = (page - 1) * limit;

    const totalCount = await prisma.laporan.count({
      where: {
        userId: Number(userId),
      },
    });

    const daftarRiwayat = await prisma.laporan.findMany({
      where: {
        userId: Number(userId),
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.setHeader('X-Total-Count', totalCount.toString());
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
    return res.status(200).json(daftarRiwayat);
  } catch (error) {
    logger.error({ err: error }, "ERROR GET RIWAYAT:");
    return res.status(500).json({ message: "Terjadi kesalahan server saat mengambil data riwayat." });
  }
}

export async function getRiwayatDetail(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Akses ditolak. Silakan login terlebih dahulu." });
    }

    const rawId = req.params.id;
    if (!rawId || !/^\d+$/.test(rawId)) {
      return res.status(400).json({ message: "ID laporan tidak valid." });
    }

    const laporanId = parseInt(rawId, 10);
    if (isNaN(laporanId) || laporanId <= 0) {
      return res.status(400).json({ message: "ID laporan tidak valid." });
    }

    const laporan = await prisma.laporan.findFirst({
      where: {
        id: laporanId,
        userId: Number(userId),
      },
    });

    if (!laporan) {
      return res.status(404).json({ message: "Laporan tidak ditemukan." });
    }

    return res.status(200).json(laporan);
  } catch (error) {
    logger.error({ err: error }, "ERROR GET RIWAYAT DETAIL:");
    return res.status(500).json({ message: "Terjadi kesalahan server saat mengambil detail laporan." });
  }
}

