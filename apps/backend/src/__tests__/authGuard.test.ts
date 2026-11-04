import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authGuard } from '../middlewares/authGuard';
import prisma from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe('authGuard Middleware', () => {
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

  it('harus menolak request tanpa token dengan status 401', async () => {
    const req = {
      cookies: {},
      headers: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Akses ditolak'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('harus menolak request dengan token invalid/palsu dengan status 401', async () => {
    const req = {
      cookies: { token: 'invalid-fake-token' },
      headers: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Sesi tidak valid'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('harus menolak jika user tidak ada di database (401)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const token = jwt.sign({ id: 999, email: 'ghost@test.com', tv: 0 }, TEST_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    const req = {
      cookies: { token },
      headers: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Pengguna tidak ditemukan atau belum diverifikasi'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('harus menolak jika tokenVersion pada token berbeda dengan di DB (401)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      nama: 'Budi Test',
      email: 'budi@test.com',
      role: 'WARGA',
      isVerified: true,
      tokenVersion: 2, // DB sudah versi 2 (mis. setelah reset password)
    });

    // Token masih membawa tv = 1 (sesi lama)
    const oldToken = jwt.sign({ id: 1, email: 'budi@test.com', tv: 1 }, TEST_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    const req = {
      cookies: { token: oldToken },
      headers: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Sesi tidak valid atau telah berakhir'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('harus menolak algoritma selain HS256 (mis. "none")', async () => {
    // Buat token tanpa tanda tangan / alg "none"
    const noneAlgToken = jwt.sign({ id: 1, email: 'hacker@test.com', tv: 0 }, '', {
      algorithm: 'none',
    });

    const req = {
      cookies: { token: noneAlgToken },
      headers: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus mengizinkan token valid dan role dari DB menimpa klaim role pada token', async () => {
    // Token dipalsukan/dibuat dengan klaim role: ADMIN
    const token = jwt.sign(
      { id: 1, email: 'budi@test.com', role: 'ADMIN', tv: 0 },
      TEST_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    // Di DB role sebenarnya adalah WARGA
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      nama: 'Budi Test',
      email: 'budi@test.com',
      role: 'WARGA',
      isVerified: true,
      tokenVersion: 0,
    });

    const req = {
      cookies: { token },
      headers: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // Role pada req.user WAJIB dari DB ('WARGA'), bukan dari klaim token ('ADMIN')
    expect((req as any).user.role).toBe('WARGA');
    expect((req as any).user.tokenVersion).toBe(0);
  });

  it('harus mendukung token dari header Authorization: Bearer <token>', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 2,
      nama: 'Admin Real',
      email: 'admin@test.com',
      role: 'ADMIN',
      isVerified: true,
      tokenVersion: 1,
    });

    const validToken = jwt.sign(
      { id: 2, email: 'admin@test.com', tv: 1 },
      TEST_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const req = {
      cookies: {},
      headers: { authorization: `Bearer ${validToken}` },
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).user.role).toBe('ADMIN');
  });

  it('harus mengembalikan 500 jika JWT_SECRET tidak terkonfigurasi', async () => {
    delete process.env.JWT_SECRET;

    const req = {
      cookies: { token: 'any-token' },
      headers: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    await authGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();

    // Restore
    process.env.JWT_SECRET = TEST_SECRET;
  });
});
