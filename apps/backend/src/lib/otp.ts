import crypto from 'crypto';

export const MAX_OTP_ATTEMPTS = 5;

/**
 * Menghasilkan 6 digit angka OTP acak yang aman secara kriptografi (CSPRNG).
 */
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Melakukan hashing OTP menggunakan HMAC-SHA256 dengan kunci JWT_SECRET.
 */
export function hashOtp(otp: string): string {
  const secret = process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', secret).update(otp).digest('hex');
}

/**
 * Memverifikasi kecocokan OTP dengan hash tersimpan secara timing-safe.
 */
export function verifyOtpHash(otp: string, storedHash: string): boolean {
  if (!otp || !storedHash) {
    return false;
  }
  try {
    const candidateHash = hashOtp(otp);
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');

    if (candidateBuf.length !== storedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Menyamarkan alamat email untuk kebutuhan logging yang aman (anti-kebocoran PII).
 * Contoh: user@example.com -> us***@example.com
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '***';
  }
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return '***';
  }

  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }
  return `${localPart.slice(0, 2)}***@${domain}`;
}
