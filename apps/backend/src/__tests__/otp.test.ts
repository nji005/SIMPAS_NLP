import { generateOtp, hashOtp, verifyOtpHash, maskEmail, MAX_OTP_ATTEMPTS } from '../lib/otp';

describe('OTP Utilities (src/lib/otp.ts)', () => {
  const TEST_SECRET = 'ganti-dengan-nilai-anda';
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  describe('generateOtp', () => {
    it('harus selalu menghasilkan 6 digit angka numerik', () => {
      for (let i = 0; i < 50; i++) {
        const otp = generateOtp();
        expect(otp).toHaveLength(6);
        expect(/^\d{6}$/.test(otp)).toBe(true);
        const num = parseInt(otp, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThan(1000000);
      }
    });
  });

  describe('hashOtp', () => {
    it('harus menghasilkan hash yang bukan plaintext dan konsisten', () => {
      const otp = '654321';
      const hash1 = hashOtp(otp);
      const hash2 = hashOtp(otp);

      // Bukan plaintext
      expect(hash1).not.toBe(otp);
      expect(hash1).toHaveLength(64); // SHA-256 hex string length is 64

      // Konsisten
      expect(hash1).toBe(hash2);

      // OTP berbeda menghasilkan hash berbeda
      const differentHash = hashOtp('123456');
      expect(differentHash).not.toBe(hash1);
    });
  });

  describe('verifyOtpHash', () => {
    it('harus mengembalikan true untuk OTP yang cocok dengan hash tersimpan', () => {
      const otp = '789123';
      const hash = hashOtp(otp);
      expect(verifyOtpHash(otp, hash)).toBe(true);
    });

    it('harus mengembalikan false untuk OTP yang salah', () => {
      const otp = '789123';
      const hash = hashOtp(otp);
      expect(verifyOtpHash('111222', hash)).toBe(false);
    });

    it('harus mengembalikan false untuk input kosong atau tidak valid', () => {
      const hash = hashOtp('123456');
      expect(verifyOtpHash('', hash)).toBe(false);
      expect(verifyOtpHash('123456', '')).toBe(false);
      expect(verifyOtpHash('123456', 'hash-rusak')).toBe(false);
    });
  });

  describe('maskEmail', () => {
    it('harus menyamarkan bagian lokal email dengan benar', () => {
      expect(maskEmail('warga@sipmas.go.id')).toBe('wa***@sipmas.go.id');
      expect(maskEmail('budi.santoso@gmail.com')).toBe('bu***@gmail.com');
      expect(maskEmail('ab@domain.com')).toBe('a***@domain.com');
      expect(maskEmail('a@domain.com')).toBe('a***@domain.com');
    });

    it('harus menangani format email tidak valid secara aman', () => {
      expect(maskEmail('')).toBe('***');
      expect(maskEmail('bukan-email')).toBe('***');
      expect(maskEmail(null as unknown as string)).toBe('***');
    });
  });

  describe('MAX_OTP_ATTEMPTS', () => {
    it('harus bernilai 5', () => {
      expect(MAX_OTP_ATTEMPTS).toBe(5);
    });
  });
});
