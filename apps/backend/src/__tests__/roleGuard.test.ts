import { Request, Response, NextFunction } from 'express';
import { roleGuard } from '../middlewares/roleGuard';

describe('roleGuard Middleware', () => {
  const createMockResponse = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  it('harus menolak request tanpa req.user dengan status 401', () => {
    const req = {} as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    const middleware = roleGuard('ADMIN');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Silakan masuk (login) terlebih dahulu'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('harus menolak user dengan role WARGA saat mengakses route ADMIN dengan status 403', () => {
    const req = {
      user: {
        id: 1,
        nama: 'Warga Biasa',
        email: 'warga@test.com',
        role: 'WARGA',
      },
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    const middleware = roleGuard('ADMIN');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('tidak memiliki izin'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('harus mengizinkan user dengan role ADMIN saat mengakses route ADMIN dan memanggil next()', () => {
    const req = {
      user: {
        id: 99,
        nama: 'Super Admin',
        email: 'admin@sipmas.go.id',
        role: 'ADMIN',
      },
    } as unknown as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    const middleware = roleGuard('ADMIN');
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
