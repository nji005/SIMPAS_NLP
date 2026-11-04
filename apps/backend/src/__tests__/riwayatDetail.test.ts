import { Request, Response, NextFunction } from 'express';
import { getRiwayatDetail } from '../modules/riwayat/riwayat.controller';
import prisma from '../lib/prisma';
import { authGuard } from '../middlewares/authGuard';

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    laporan: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe('Riwayat Detail API (Fase 22.1)', () => {
  const TEST_SECRET = 'ganti-dengan-nilai-anda';
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockResponse = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  describe('Controller getRiwayatDetail', () => {
    it('harus mengembalikan status 200 dan data laporan jika diakses oleh pemilik laporan', async () => {
      const mockLaporan = {
        id: 10,
        judul: 'Lampu Jalan Rusak',
        isi: '[KATEGORI: Infrastruktur]\nLampu jalan padam di RT 03.',
        foto: '/uploads/lampu.jpg',
        status: 'SELESAI',
        userId: 1,
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        catatanSelesai: 'Lampu telah diganti dengan LED baru oleh dinas terkait.',
        fotoSelesai: '/uploads/bukti-lampu.jpg',
        selesaiAt: new Date('2026-11-02T14:00:00.000Z'),
      };

      (prisma.laporan.findFirst as jest.Mock).mockResolvedValue(mockLaporan);

      const req = {
        params: { id: '10' },
        user: { id: 1, role: 'WARGA' },
      } as unknown as Request;
      const res = createMockResponse();

      await getRiwayatDetail(req, res);

      expect(prisma.laporan.findFirst).toHaveBeenCalledWith({
        where: {
          id: 10,
          userId: 1,
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockLaporan);
    });

    it('harus mengembalikan status 404 "Laporan tidak ditemukan." jika laporan milik warga lain (IDOR protection)', async () => {
      // User 2 mencoba membuka laporan yang dimiliki user 1 -> findFirst mengembalikan null
      (prisma.laporan.findFirst as jest.Mock).mockResolvedValue(null);

      const req = {
        params: { id: '10' },
        user: { id: 2, role: 'WARGA' },
      } as unknown as Request;
      const res = createMockResponse();

      await getRiwayatDetail(req, res);

      expect(prisma.laporan.findFirst).toHaveBeenCalledWith({
        where: {
          id: 10,
          userId: 2,
        },
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Laporan tidak ditemukan.' });
    });

    it('harus mengembalikan status 404 "Laporan tidak ditemukan." jika ID laporan tidak ada di database', async () => {
      (prisma.laporan.findFirst as jest.Mock).mockResolvedValue(null);

      const req = {
        params: { id: '99999' },
        user: { id: 1, role: 'WARGA' },
      } as unknown as Request;
      const res = createMockResponse();

      await getRiwayatDetail(req, res);

      expect(prisma.laporan.findFirst).toHaveBeenCalledWith({
        where: {
          id: 99999,
          userId: 1,
        },
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Laporan tidak ditemukan.' });
    });

    it('harus menolak dengan status 400 jika ID bukan integer positif (string non-numerik)', async () => {
      const req = {
        params: { id: 'abc' },
        user: { id: 1, role: 'WARGA' },
      } as unknown as Request;
      const res = createMockResponse();

      await getRiwayatDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'ID laporan tidak valid.' });
      expect(prisma.laporan.findFirst).not.toHaveBeenCalled();
    });

    it('harus menolak dengan status 400 jika ID bernilai 0 atau negatif', async () => {
      const req1 = {
        params: { id: '0' },
        user: { id: 1, role: 'WARGA' },
      } as unknown as Request;
      const res1 = createMockResponse();

      await getRiwayatDetail(req1, res1);

      expect(res1.status).toHaveBeenCalledWith(400);
      expect(res1.json).toHaveBeenCalledWith({ message: 'ID laporan tidak valid.' });

      const req2 = {
        params: { id: '-5' },
        user: { id: 1, role: 'WARGA' },
      } as unknown as Request;
      const res2 = createMockResponse();

      await getRiwayatDetail(req2, res2);

      expect(res2.status).toHaveBeenCalledWith(400);
      expect(res2.json).toHaveBeenCalledWith({ message: 'ID laporan tidak valid.' });
      expect(prisma.laporan.findFirst).not.toHaveBeenCalled();
    });

    it('harus menolak dengan status 401 jika diakses tanpa login (req.user tidak ada)', async () => {
      const req = {
        params: { id: '10' },
      } as unknown as Request;
      const res = createMockResponse();

      await getRiwayatDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Akses ditolak. Silakan login terlebih dahulu.' });
      expect(prisma.laporan.findFirst).not.toHaveBeenCalled();
    });

    it('harus mengembalikan status 500 jika terjadi kesalahan database', async () => {
      (prisma.laporan.findFirst as jest.Mock).mockRejectedValue(new Error('DB Connection Timeout'));

      const req = {
        params: { id: '10' },
        user: { id: 1, role: 'WARGA' },
      } as unknown as Request;
      const res = createMockResponse();

      await getRiwayatDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server saat mengambil detail laporan.' });
    });
  });

  describe('Integrasi authGuard pada route detail', () => {
    it('harus menolak request tanpa token dengan status 401', () => {
      const req = {
        cookies: {},
        headers: {},
      } as unknown as Request;
      const res = createMockResponse();
      const next = jest.fn() as NextFunction;

      authGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Silakan masuk (login) terlebih dahulu'),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
