import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs, { existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { logger } from '../lib/logger';

const uploadDir = path.join(process.cwd(), 'public/uploads');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

export function detectImageFormat(buf: Buffer): { ext: 'jpg' | 'png' | 'webp'; format: 'jpeg' | 'png' | 'webp'; mime: string } | null {
  if (!buf || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', format: 'jpeg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: 'png', format: 'png', mime: 'image/png' };
  }

  // WEBP: RIFF (bytes 0-3) dan WEBP (bytes 8-11)
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', format: 'webp', mime: 'image/webp' };
  }

  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
}).single('foto');

export function validateUpload(req: Request, res: Response, next: NextFunction) {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: 'Ukuran file terlalu besar! Maksimal ukuran file foto adalah 5MB.',
        });
      }
      return res.status(400).json({
        message: `Kesalahan upload: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        message: err.message,
      });
    }

    if (!req.file) {
      return next();
    }

    // 1. Cek Magic Bytes (Verifikasi bahwa file benar-benar gambar valid)
    const detected = detectImageFormat(req.file.buffer);
    if (!detected) {
      return res.status(400).json({
        message: 'Format file tidak didukung atau file palsu! Hanya gambar valid (JPEG, PNG, WEBP) yang diperbolehkan.',
      });
    }

    try {
      // 2. Sanitasi dan proses ulang menggunakan Sharp
      // - rotate(): menyesuaikan orientasi EXIF sebelum dibuang
      // - resize(): membatasi dimensi gambar terpanjang ~2560px
      // - toBuffer() tanpa withMetadata(): membuang seluruh EXIF, metadata kamera, dan koordinat GPS
      const sanitizedBuffer = await sharp(req.file.buffer, {
        limitInputPixels: 268402689,
      })
        .rotate()
        .resize({
          width: 2560,
          height: 2560,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFormat(detected.format)
        .toBuffer();

      // 3. Nama file acak menggunakan UUID + ekstensi hasil deteksi
      const filename = `${crypto.randomUUID()}.${detected.ext}`;
      const targetPath = path.join(uploadDir, filename);

      await fs.promises.writeFile(targetPath, sanitizedBuffer);

      // Update objek req.file agar modul berikutnya menerima data file yang sudah disanitasi
      req.file.filename = filename;
      req.file.path = targetPath;
      req.file.mimetype = detected.mime;
      req.file.size = sanitizedBuffer.length;
      req.file.buffer = sanitizedBuffer;

      next();
    } catch (sharpError) {
      logger.error({ err: sharpError }, 'Gagal memproses gambar dengan Sharp');
      return res.status(400).json({
        message: 'Gagal memproses gambar. Pastikan file gambar tidak rusak.',
      });
    }
  });
}
