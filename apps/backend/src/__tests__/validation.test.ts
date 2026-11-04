import { Request, Response } from 'express';
import {
  createLaporanSchema,
  patchLaporanStatusSchema,
  selesaikanLaporanSchema,
  patchUserRoleSchema,
} from '../middlewares/validate';
import {
  patchAdminLaporan,
  patchAdminUsers,
  normalizeCategory,
} from '../modules/admin/admin.controller';
import prisma from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    laporan: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('Validation Schemas & P2025 Error Mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockResponse = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  describe('createLaporanSchema', () => {
    it('harus menerima data laporan valid', () => {
      const validData = {
        judul: 'Jalan Rusak di Lingkungan Ramanuju',
        isi: 'Terdapat lubang besar sedalam 20cm di pertigaan jalan utama.',
        lokasi: 'Kecamatan Citangkil',
        tanggal: '2026-10-15',
        kategori: 'Infrastruktur',
      };

      const result = createLaporanSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.judul).toBe('Jalan Rusak di Lingkungan Ramanuju');
        expect(result.data.kategori).toBe('Infrastruktur');
      }
    });

    it('harus menolak judul > 150 karakter', () => {
      const invalidData = {
        judul: 'A'.repeat(151),
        isi: 'Deskripsi isi laporan',
      };

      const result = createLaporanSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('maksimal 150 karakter');
      }
    });

    it('harus menolak isi > 5000 karakter', () => {
      const invalidData = {
        judul: 'Judul Valid',
        isi: 'A'.repeat(5001),
      };

      const result = createLaporanSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('maksimal 5000 karakter');
      }
    });

    it('harus menolak lokasi > 191 karakter', () => {
      const invalidData = {
        judul: 'Judul Valid',
        isi: 'Isi Valid',
        lokasi: 'L'.repeat(192),
      };

      const result = createLaporanSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('maksimal 191 karakter');
      }
    });

    it('harus menolak format tanggal tidak valid', () => {
      const invalidData = {
        judul: 'Judul Valid',
        isi: 'Isi Valid',
        tanggal: 'tanggal-sembarangan',
      };

      const result = createLaporanSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Format tanggal tidak valid');
      }
    });

    it('harus mengubah kategori di luar daftar putih menjadi Lainnya', () => {
      const data = {
        judul: 'Judul Valid',
        isi: 'Isi Valid',
        kategori: 'KategoriSembarangan123',
      };

      const result = createLaporanSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kategori).toBe('Lainnya');
      }
    });

    it('harus mempertahankan kategori whitelist dengan kapitalisasi rapi', () => {
      const data = {
        judul: 'Judul Valid',
        isi: 'Isi Valid',
        kategori: 'lingkungan',
      };

      const result = createLaporanSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.kategori).toBe('Lingkungan');
      }
    });

    it('harus menormalisasi kategori "Keamanan" dan "keamanan" menjadi "Lainnya"', () => {
      const dataCapital = {
        judul: 'Laporan Keamanan',
        isi: 'Terjadi gangguan keamanan',
        kategori: 'Keamanan',
      };
      const resultCapital = createLaporanSchema.safeParse(dataCapital);
      expect(resultCapital.success).toBe(true);
      if (resultCapital.success) {
        expect(resultCapital.data.kategori).toBe('Lainnya');
      }

      const dataLower = {
        judul: 'Laporan Keamanan',
        isi: 'Terjadi gangguan keamanan',
        kategori: 'keamanan',
      };
      const resultLower = createLaporanSchema.safeParse(dataLower);
      expect(resultLower.success).toBe(true);
      if (resultLower.success) {
        expect(resultLower.data.kategori).toBe('Lainnya');
      }
    });
  });

  describe('normalizeCategory', () => {
    it('harus menormalisasi kategori keamanan dan ketertiban menjadi "Lainnya"', () => {
      expect(normalizeCategory('Keamanan', null)).toBe('Lainnya');
      expect(normalizeCategory('keamanan', null)).toBe('Lainnya');
      expect(normalizeCategory('Ketertiban', null)).toBe('Lainnya');
      expect(normalizeCategory('ketertiban umum', null)).toBe('Lainnya');
      expect(normalizeCategory(null, 'keamanan')).toBe('Lainnya');
      expect(normalizeCategory(null, 'ketertiban')).toBe('Lainnya');
    });

    it('harus menormalisasi kategori resmi Infrastruktur, Lingkungan, dan Pelayanan', () => {
      expect(normalizeCategory('Infrastruktur', null)).toBe('Infrastruktur');
      expect(normalizeCategory('lingkungan', null)).toBe('Lingkungan');
      expect(normalizeCategory('pelayanan', null)).toBe('Pelayanan');
    });
  });

  describe('patchLaporanStatusSchema & selesaikanLaporanSchema & patchUserRoleSchema', () => {
    it('harus memvalidasi status laporan yang diizinkan pada patch biasa (hanya PENDING dan PROSES)', () => {
      expect(patchLaporanStatusSchema.safeParse({ id: 10, status: 'PENDING' }).success).toBe(true);
      expect(patchLaporanStatusSchema.safeParse({ id: 10, status: 'PROSES' }).success).toBe(true);
      expect(patchLaporanStatusSchema.safeParse({ id: 10, status: 'SELESAI' }).success).toBe(false);
      expect(patchLaporanStatusSchema.safeParse({ id: 10, status: 'DITOLAK' }).success).toBe(false);
    });

    it('harus memvalidasi selesaikanLaporanSchema (catatanSelesai 10-2000 karakter)', () => {
      expect(selesaikanLaporanSchema.safeParse({ catatanSelesai: 'Tanggapan sudah ditindaklanjuti' }).success).toBe(true);
      expect(selesaikanLaporanSchema.safeParse({ catatanSelesai: 'Pendek' }).success).toBe(false);
      expect(selesaikanLaporanSchema.safeParse({ catatanSelesai: '' }).success).toBe(false);
      expect(selesaikanLaporanSchema.safeParse({}).success).toBe(false);
      expect(selesaikanLaporanSchema.safeParse({ catatanSelesai: 'A'.repeat(2001) }).success).toBe(false);
    });

    it('harus memvalidasi role user yang diizinkan', () => {
      expect(patchUserRoleSchema.safeParse({ id: 5, role: 'ADMIN' }).success).toBe(true);
      expect(patchUserRoleSchema.safeParse({ id: 5, role: 'WARGA' }).success).toBe(true);
      expect(patchUserRoleSchema.safeParse({ id: 5, role: 'SUPERADMIN' }).success).toBe(false);
    });
  });

  describe('Prisma P2025 -> 404 Mapping', () => {
    it('patchAdminLaporan harus memetakan P2025 ke 404', async () => {
      (prisma.laporan.findUnique as jest.Mock).mockResolvedValue(null);

      const req = {
        body: { id: 9999, status: 'PROSES' },
      } as Request;
      const res = createMockResponse();

      await patchAdminLaporan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Laporan tidak ditemukan.' })
      );
    });

    it('patchAdminUsers harus memetakan P2025 ke 404 saat update', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 9999,
        nama: 'User Ghost',
        role: 'WARGA',
      });

      const p2025Error = new Error('Record to update not found.') as any;
      p2025Error.code = 'P2025';
      (prisma.user.update as jest.Mock).mockRejectedValue(p2025Error);

      const req = {
        user: { id: 1, role: 'ADMIN' },
        body: { id: 9999, role: 'ADMIN' },
      } as unknown as Request;
      const res = createMockResponse();

      await patchAdminUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Pengguna tidak ditemukan.' })
      );
    });
  });
});
