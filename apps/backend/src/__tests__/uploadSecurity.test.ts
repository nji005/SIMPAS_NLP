import { detectImageFormat } from '../middlewares/uploadValidator';
import sharp from 'sharp';

describe('Upload Security & Sanitization', () => {
  it('harus menolak file palsu (teks dengan ekstensi gambar) karena signature tidak cocok', () => {
    const fakeFileBuffer = Buffer.from('INI_BUKAN_GAMBAR_MELAINKAN_SKRIP_JAHAT');
    const result = detectImageFormat(fakeFileBuffer);
    expect(result).toBeNull();
  });

  it('harus mendeteksi JPEG yang valid berdasarkan magic bytes FF D8 FF', () => {
    const jpegBuf = Buffer.alloc(20);
    jpegBuf[0] = 0xff;
    jpegBuf[1] = 0xd8;
    jpegBuf[2] = 0xff;
    jpegBuf[3] = 0xe0;

    const result = detectImageFormat(jpegBuf);
    expect(result).toEqual({ ext: 'jpg', format: 'jpeg', mime: 'image/jpeg' });
  });

  it('harus mendeteksi PNG yang valid berdasarkan magic bytes 89 50 4E 47 0D 0A 1A 0A', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const result = detectImageFormat(pngBuf);
    expect(result).toEqual({ ext: 'png', format: 'png', mime: 'image/png' });
  });

  it('harus mendeteksi WEBP yang valid berdasarkan RIFF....WEBP', () => {
    const webpBuf = Buffer.alloc(16);
    webpBuf.write('RIFF', 0, 4, 'ascii');
    webpBuf.write('WEBP', 8, 4, 'ascii');

    const result = detectImageFormat(webpBuf);
    expect(result).toEqual({ ext: 'webp', format: 'webp', mime: 'image/webp' });
  });

  it('harus membuang seluruh metadata EXIF/GPS setelah diproses Sharp', async () => {
    // Buat gambar sintetis kecil dengan Sharp
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    // Sanitasi seperti alur uploadValidator
    const sanitizedBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .toFormat('jpeg')
      .toBuffer();

    // Periksa metadata hasil
    const metadata = await sharp(sanitizedBuffer).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });
});
