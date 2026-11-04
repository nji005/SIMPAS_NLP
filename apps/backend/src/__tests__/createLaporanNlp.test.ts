import { Request, Response } from 'express';
import { createLaporan } from '../modules/laporan/laporan.controller';
import * as nlpClient from '../services/nlpClient';
import prisma from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    laporan: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../services/nlpClient');
jest.mock('../services/storageService', () => ({
  storageService: {
    upload: jest.fn().mockResolvedValue({ url: '/uploads/dummy.jpg', key: 'dummy.jpg' }),
  },
}));

describe('createLaporan - NLP Integration & Fallback Lainnya', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      body: {
        judul: 'Keluhan Warga',
        isi: 'Ada laporan masalah tertentu di lingkungan sekitar',
        lokasi: 'Kecamatan Cibeber',
        tanggal: '2026-10-15',
        kategori: 'lainnya',
      },
      user: {
        id: 1,
        email: 'warga@test.com',
        role: 'WARGA',
      },
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
  });

  it('harus memakai kategori terprediksi jika NLP yakin (uncertain=false)', async () => {
    (nlpClient.predictCategory as jest.Mock).mockResolvedValue({
      category: 'infrastruktur',
      confidence: 0.85,
      uncertain: false,
    });

    (prisma.laporan.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 101, ...data }));

    await createLaporan(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(prisma.laporan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kategori: 'Infrastruktur',
          kategoriPrediksi: 'infrastruktur',
          confidenceScore: 0.85,
        }),
      })
    );
  });

  it('harus fallback ke kategori "Lainnya" jika NLP tidak yakin (uncertain=true), tetapi tetap menyimpan kategoriPrediksi dan confidenceScore', async () => {
    (nlpClient.predictCategory as jest.Mock).mockResolvedValue({
      category: 'infrastruktur',
      confidence: 0.38,
      uncertain: true,
    });

    (prisma.laporan.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 102, ...data }));

    await createLaporan(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(prisma.laporan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kategori: 'Lainnya',
          kategoriPrediksi: 'infrastruktur',
          confidenceScore: 0.38,
        }),
      })
    );
  });

  it('harus fallback ke kategori "Lainnya" jika layanan NLP offline / null tanpa menghalangi pengiriman laporan', async () => {
    (nlpClient.predictCategory as jest.Mock).mockResolvedValue(null);

    (prisma.laporan.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 103, ...data }));

    await createLaporan(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(prisma.laporan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kategori: 'Lainnya',
          kategoriPrediksi: null,
          confidenceScore: null,
        }),
      })
    );
  });
});
