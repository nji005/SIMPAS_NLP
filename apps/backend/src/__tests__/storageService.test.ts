import { storageService } from '../services/storageService';

describe('storageService', () => {
  it('harus fallback ke local storage jika S3/MinIO tidak dikonfigurasi', async () => {
    // When S3 credentials are not set, it should safely use local storage
    const mockFile = {
      fieldname: 'foto',
      originalname: 'test_foto.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      destination: 'public/uploads',
      filename: '1234567890-test_foto.jpg',
      path: 'public/uploads/1234567890-test_foto.jpg',
      size: 1024,
    } as Express.Multer.File;

    const result = await storageService.upload(mockFile);

    expect(result).toBeDefined();
    expect(result.filename).toBe('1234567890-test_foto.jpg');
    expect(result.url).toBe('/uploads/1234567890-test_foto.jpg');
    expect(result.storageType).toBe('local');
  });

  it('harus mengembalikan null untuk getObjectStream jika MinIO tidak aktif', async () => {
    const stream = await storageService.getObjectStream('non_existent.jpg');
    expect(stream).toBeNull();
  });
});
