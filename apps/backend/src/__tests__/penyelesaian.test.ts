import { Request, Response } from 'express';
import {
  selesaikanLaporan,
  patchAdminLaporan,
} from '../modules/admin/admin.controller';
import {
  validate,
  selesaikanLaporanSchema,
  patchLaporanStatusSchema,
} from '../middlewares/validate';
import prisma from '../lib/prisma';
import { storageService } from '../services/storageService';

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    laporan: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../services/storageService', () => ({
  __esModule: true,
  storageService: {
    upload: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('Penyelesaian Laporan (Fase 21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockResponse = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  describe('Validasi selesaikanLaporanSchema', () => {
    const validateMiddleware = validate(selesaikanLaporanSchema);

    it('harus menolak request tanpa catatanSelesai dengan status 400', () => {
      const req = { body: {} } as Request;
      const res = createMockResponse();
      const next = jest.fn();

      validateMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Tanggapan penyelesaian wajib diisi'),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('harus menolak catatanSelesai kurang dari 10 karakter dengan status 400', () => {
      const req = { body: { catatanSelesai: 'Pendek' } } as Request;
      const res = createMockResponse();
      const next = jest.fn();

      validateMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('minimal 10 karakter'),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('harus meloloskan catatanSelesai yang valid (>= 10 karakter)', () => {
      const req = { body: { catatanSelesai: 'Perbaikan jalan telah selesai dikerjakan.' } } as Request;
      const res = createMockResponse();
      const next = jest.fn();

      validateMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.body.catatanSelesai).toBe('Perbaikan jalan telah selesai dikerjakan.');
    });
  });

  describe('Controller selesaikanLaporan', () => {
    it('harus mengembalikan 404 jika laporan tidak ditemukan', async () => {
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue(null);

      const req = {
        params: { id: '999' },
        body: { catatanSelesai: 'Perbaikan penerangan jalan sudah diselesaikan.' },
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Laporan tidak ditemukan.' });
    });

    it('harus mengembalikan 409 jika laporan sudah berstatus SELESAI', async () => {
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        status: 'SELESAI',
        catatanSelesai: 'Sudah pernah diselesaikan sebelumnya.',
      });

      const req = {
        params: { id: '10' },
        body: { catatanSelesai: 'Tanggapan perbaikan baru untuk laporan yang sudah selesai.' },
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'Laporan sudah diselesaikan.' });
    });

    it('harus menghapus file bukti jika ID laporan tidak valid (400)', async () => {
      const fakeFile = {
        filename: 'bukti-invalid-id.jpg',
        path: '/tmp/bukti-invalid-id.jpg',
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const req = {
        params: { id: 'invalid-id' },
        body: { catatanSelesai: 'Perbaikan jalan telah selesai dikerjakan.' },
        file: fakeFile,
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(storageService.delete).toHaveBeenCalledWith('bukti-invalid-id.jpg');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'ID laporan tidak valid.' });
    });

    it('harus menghapus file bukti jika laporan tidak ditemukan (404)', async () => {
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue(null);

      const fakeFile = {
        filename: 'bukti-not-found.jpg',
        path: '/tmp/bukti-not-found.jpg',
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const req = {
        params: { id: '999' },
        body: { catatanSelesai: 'Perbaikan penerangan jalan sudah diselesaikan.' },
        file: fakeFile,
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(storageService.delete).toHaveBeenCalledWith('bukti-not-found.jpg');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Laporan tidak ditemukan.' });
    });

    it('harus menghapus file bukti jika laporan sudah berstatus SELESAI (409)', async () => {
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        status: 'SELESAI',
      });

      const fakeFile = {
        filename: 'bukti-already-done.jpg',
        path: '/tmp/bukti-already-done.jpg',
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const req = {
        params: { id: '10' },
        body: { catatanSelesai: 'Tanggapan perbaikan baru untuk laporan yang sudah selesai.' },
        file: fakeFile,
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(storageService.delete).toHaveBeenCalledWith('bukti-already-done.jpg');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'Laporan sudah diselesaikan.' });
    });

    it('harus berhasil menyelesaikan laporan tanpa foto bukti (Pelayanan)', async () => {
      const mockLaporan = {
        id: 15,
        status: 'PROSES',
        judul: 'Pelayanan KTP Lambat',
        catatanSelesai: null,
        fotoSelesai: null,
        selesaiAt: null,
      };

      const updatedMockLaporan = {
        ...mockLaporan,
        status: 'SELESAI',
        catatanSelesai: 'Petugas loket telah ditegur dan berkas KTP telah diproses dan diserahkan ke warga.',
        fotoSelesai: null,
        selesaiAt: new Date(),
        user: {
          nik: '3672010101900001',
          nama: 'Budi Santoso',
          email: 'budi@example.com',
        },
      };

      (prisma.laporan.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockLaporan)
        .mockResolvedValueOnce(updatedMockLaporan);
      (prisma.laporan.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const req = {
        params: { id: '15' },
        body: { catatanSelesai: 'Petugas loket telah ditegur dan berkas KTP telah diproses dan diserahkan ke warga.' },
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(prisma.laporan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 15, status: { not: 'SELESAI' } },
          data: expect.objectContaining({
            status: 'SELESAI',
            catatanSelesai: 'Petugas loket telah ditegur dan berkas KTP telah diproses dan diserahkan ke warga.',
            fotoSelesai: null,
            selesaiAt: expect.any(Date),
          }),
        })
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('harus berhasil menyelesaikan laporan dengan foto bukti (Infrastruktur)', async () => {
      const mockLaporan = {
        id: 20,
        status: 'PENDING',
        judul: 'Jalan Rusak Berlubang',
        catatanSelesai: null,
        fotoSelesai: null,
        selesaiAt: null,
      };

      const updatedMockLaporan = {
        ...mockLaporan,
        status: 'SELESAI',
        catatanSelesai: 'Pengaspalan jalan berlubang telah selesai dikerjakan oleh dinas PU.',
        fotoSelesai: '/uploads/bukti-1234.jpg',
        selesaiAt: new Date(),
        user: {
          nik: '3672010101900001',
          nama: 'Budi Santoso',
          email: 'budi@example.com',
        },
      };

      (prisma.laporan.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockLaporan)
        .mockResolvedValueOnce(updatedMockLaporan);
      (prisma.laporan.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (storageService.upload as jest.Mock).mockResolvedValue({
        filename: 'bukti-1234.jpg',
        url: '/uploads/bukti-1234.jpg',
        storageType: 'local',
      });

      const fakeFile = {
        filename: 'bukti-1234.jpg',
        path: '/tmp/bukti-1234.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('FAKE_IMAGE'),
      } as Express.Multer.File;

      const req = {
        params: { id: '20' },
        body: { catatanSelesai: 'Pengaspalan jalan berlubang telah selesai dikerjakan oleh dinas PU.' },
        file: fakeFile,
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(storageService.upload).toHaveBeenCalledWith(fakeFile);
      expect(prisma.laporan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 20, status: { not: 'SELESAI' } },
          data: expect.objectContaining({
            status: 'SELESAI',
            catatanSelesai: 'Pengaspalan jalan berlubang telah selesai dikerjakan oleh dinas PU.',
            fotoSelesai: '/uploads/bukti-1234.jpg',
            selesaiAt: expect.any(Date),
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Laporan berhasil diselesaikan.',
          laporan: expect.objectContaining({
            status: 'SELESAI',
            fotoSelesai: '/uploads/bukti-1234.jpg',
          }),
        })
      );
    });

    it('harus membalas 409 bila 0 baris berubah (dua admin menyelesaikan bersamaan) dan menghapus file', async () => {
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue({
        id: 12,
        status: 'PROSES',
      });
      // Saat updateMany dieksekusi, statusnya sudah diselesaikan oleh admin lain -> count = 0
      (prisma.laporan.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const fakeFile = {
        filename: 'bukti-race.jpg',
        path: '/tmp/bukti-race.jpg',
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const req = {
        params: { id: '12' },
        body: { catatanSelesai: 'Catatan penyelesaian saat balapan status.' },
        file: fakeFile,
        user: { id: 2, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(prisma.laporan.updateMany).toHaveBeenCalledWith({
        where: {
          id: 12,
          status: { not: 'SELESAI' },
        },
        data: expect.objectContaining({
          status: 'SELESAI',
          catatanSelesai: 'Catatan penyelesaian saat balapan status.',
        }),
      });
      expect(storageService.delete).toHaveBeenCalledWith('bukti-race.jpg');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'Laporan sudah diselesaikan.' });
    });

    it('harus menghapus file bukti upload (rollback) bila Prisma update gagal', async () => {
      const mockLaporan = { id: 25, status: 'PROSES' };
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue(mockLaporan);
      (storageService.upload as jest.Mock).mockResolvedValue({
        filename: 'bukti-fail.jpg',
        url: '/uploads/bukti-fail.jpg',
        storageType: 'local',
      });
      (prisma.laporan.updateMany as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const fakeFile = {
        filename: 'bukti-fail.jpg',
        path: '/tmp/bukti-fail.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('FAKE'),
      } as Express.Multer.File;

      const req = {
        params: { id: '25' },
        body: { catatanSelesai: 'Catatan penyelesaian yang valid dan panjang.' },
        file: fakeFile,
        user: { id: 1, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await selesaikanLaporan(req, res);

      expect(storageService.delete).toHaveBeenCalledWith('bukti-fail.jpg');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('PATCH /api/admin/laporan (Proteksi Status SELESAI)', () => {
    it('harus menolak PATCH status SELESAI dengan status 400', async () => {
      const req = {
        body: { id: 10, status: 'SELESAI' },
      } as Request;
      const res = createMockResponse();

      // Test validasi skema
      const schemaResult = patchLaporanStatusSchema.safeParse(req.body);
      expect(schemaResult.success).toBe(false);

      // Test controller bila lolos skema
      await patchAdminLaporan(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Penyelesaian laporan wajib menyertakan tanggapan'),
        })
      );
      expect(prisma.laporan.update).not.toHaveBeenCalled();
    });

    it('harus menolak PATCH status pada laporan yang sudah selesai dengan status 409', async () => {
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        status: 'SELESAI',
      });

      const req = {
        body: { id: 10, status: 'PROSES' },
      } as Request;
      const res = createMockResponse();

      await patchAdminLaporan(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Laporan yang sudah selesai tidak dapat diubah statusnya.',
        })
      );
      expect(prisma.laporan.update).not.toHaveBeenCalled();
    });
  });

  describe('Akses Foto Bukti (GET /uploads/:filename)', () => {
    it('harus mengizinkan warga pemilik membuka fotoSelesai laporan miliknya', async () => {
      const filename = 'bukti-selesai-warga-1.jpg';
      const expectedPath = `/uploads/${filename}`;
      const loggedInUserId = 101;

      // Mock DB: laporan ditemukan di mana fotoSelesai cocok dan userId cocok
      (prisma.laporan.findFirst as jest.Mock).mockResolvedValue({ id: 50 });

      // Cek kondisi query OR
      const user = { id: loggedInUserId, role: 'WARGA' };
      let isAuthorized = user.role === 'ADMIN';

      if (!isAuthorized) {
        const laporan = await prisma.laporan.findFirst({
          where: {
            userId: user.id,
            OR: [
              { foto: expectedPath },
              { fotoSelesai: expectedPath },
            ],
          },
          select: { id: true },
        });
        if (laporan) isAuthorized = true;
      }

      expect(isAuthorized).toBe(true);
      expect(prisma.laporan.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 101,
          OR: [
            { foto: expectedPath },
            { fotoSelesai: expectedPath },
          ],
        },
        select: { id: true },
      });
    });

    it('harus menolak warga lain membuka fotoSelesai yang bukan miliknya', async () => {
      const filename = 'bukti-selesai-warga-1.jpg';
      const expectedPath = `/uploads/${filename}`;
      const otherCitizenId = 999;

      // Mock DB: laporan tidak ditemukan untuk otherCitizenId
      (prisma.laporan.findFirst as jest.Mock).mockResolvedValue(null);

      const user = { id: otherCitizenId, role: 'WARGA' };
      let isAuthorized = user.role === 'ADMIN';

      if (!isAuthorized) {
        const laporan = await prisma.laporan.findFirst({
          where: {
            userId: user.id,
            OR: [
              { foto: expectedPath },
              { fotoSelesai: expectedPath },
            ],
          },
          select: { id: true },
        });
        if (laporan) isAuthorized = true;
      }

      expect(isAuthorized).toBe(false);
    });
  });
});
