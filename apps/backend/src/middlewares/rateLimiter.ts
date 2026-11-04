import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 20, // Maksimal 20 percobaan per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Terlalu banyak percobaan masuk. Silakan coba lagi setelah 15 menit.',
  },
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10, // Maksimal 10 permintaan OTP per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Terlalu banyak permintaan OTP. Silakan coba lagi setelah 15 menit.',
  },
});

export const predictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 30, // Maksimal 30 per menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Terlalu banyak permintaan prediksi. Silakan coba lagi nanti.',
  },
});

export const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 60, // Maksimal 60 per menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Terlalu banyak permintaan analytics. Silakan coba lagi nanti.',
  },
});
