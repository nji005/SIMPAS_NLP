import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createMailTransport, getMailFrom } from '../../lib/mailer';
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { generateOtp, hashOtp, verifyOtpHash, maskEmail, MAX_OTP_ATTEMPTS } from '../../lib/otp';

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    // 1. Validasi input kosong
    if (!email || !password) {
      return res.status(400).json({ message: "Email dan Password wajib diisi!" });
    }

    // 2. Cari user berdasarkan email di database
    const user = await prisma.user.findUnique({
      where: { email: email }
    });

    // Anti-enumerasi: Pesan dan status seragam (401) jika email tidak ada
    if (!user) {
      logger.warn({ email: maskEmail(email), ip: req.ip }, 'Percobaan login gagal: kredensial tidak valid');
      return res.status(401).json({ message: "Email atau password salah." });
    }

    // 3. Cocokkan password yang diketik dengan hash di database
    const isPasswordValid = await bcrypt.compare(password, user.password);

    // Anti-enumerasi: Pesan dan status seragam (401) jika password salah
    if (!isPasswordValid) {
      logger.warn({ email: maskEmail(email), userId: user.id, ip: req.ip }, 'Percobaan login gagal: kredensial tidak valid');
      return res.status(401).json({ message: "Email atau password salah." });
    }

    // 403 untuk akun belum terverifikasi tetap HANYA muncul setelah password benar
    if (!user.isVerified) {
      logger.warn({ email: maskEmail(email), userId: user.id, ip: req.ip }, 'Percobaan login gagal: akun belum diverifikasi');
      return res.status(403).json({
        message: "Akun Anda belum diverifikasi! Silakan daftar ulang untuk mendapat OTP."
      });
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      logger.fatal('Konfigurasi server bermasalah: JWT_SECRET tidak diset');
      return res.status(500).json({ message: "Konfigurasi server bermasalah: JWT_SECRET tidak diset." });
    }
    const token = jwt.sign(
      {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        tv: user.tokenVersion ?? 0,
      },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logger.info({ email: maskEmail(user.email), userId: user.id, role: user.role }, 'Pengguna berhasil login');

    // Kembalikan respons berhasil
    return res.status(200).json({
      message: "Login berhasil!",
      user: { id: user.id, nama: user.nama, role: user.role }
    });
  } catch (error) {
    logger.error({ err: error, ip: req.ip }, 'Error detail login');
    return res.status(500).json({ message: "Terjadi kesalahan pada server saat login." });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Sesi tidak ditemukan." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, nik: true, nama: true, email: true, role: true, isVerified: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    return res.status(200).json({ user });
  } catch (error) {
    logger.error({ err: error }, 'ERROR GET ME');
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.status(200).json({ message: "Logout berhasil." });
}

export async function register(req: Request, res: Response) {
  try {
    const { nik, nama, email, password } = req.body;

    if (!nik || !nama || !email || !password) {
      return res.status(400).json({ message: "Semua kolom wajib diisi!" });
    }

    // 1. Validasi NIK (Harus 16 digit angka)
    if (!/^\d{16}$/.test(nik)) {
      return res.status(400).json({ message: "NIK harus terdiri dari 16 digit angka!" });
    }

    // 2. Validasi Nama (Hanya huruf/spasi)
    if (!/^[a-zA-Z\s]+$/.test(nama)) {
      return res.status(400).json({ message: "Nama lengkap hanya boleh berisi huruf!" });
    }

    // 3. Validasi Email (Format email valid)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Format email tidak valid!" });
    }

    // 4. Validasi Password (Minimal 8 karakter)
    if (password.length < 8) {
      return res.status(400).json({ message: "Kata sandi harus minimal 8 karakter!" });
    }

    // Cek apakah email atau NIK sudah ada
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { nik }] }
    });

    // Buat OTP 6 Digit CSPRNG & simpan Hash HMAC-SHA256
    const rawOtp = generateOtp();
    const otpHash = hashOtp(rawOtp);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 Menit

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(409).json({ message: "Email atau NIK sudah terdaftar & aktif!" });
      } else {
        // Jika email berbeda tetapi NIK sama, tolak untuk mencegah tabrakan pendaftaran
        if (existingUser.email !== email) {
          return res.status(409).json({ message: "NIK ini sudah diklaim oleh pendaftaran email lain yang belum aktif!" });
        }
        // Jika belum diverifikasi dengan email yang sama, perbarui data, hash OTP, dan reset otpAttempts
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { nik, nama, password: hashedPassword, otpCode: otpHash, otpExpires, otpAttempts: 0 }
        });
      }
    } else {
      // Jika user benar-benar baru
      await prisma.user.create({
        data: { nik, nama, email, password: hashedPassword, otpCode: otpHash, otpExpires, otpAttempts: 0, isVerified: false }
      });
    }

    // Kirim Email OTP dengan kode asli (rawOtp)
    const transporter = createMailTransport();

    await transporter.sendMail({
      from: getMailFrom('SIPMAS Pendaftaran'),
      to: email,
      subject: "Kode OTP Verifikasi Akun",
      html: `<h3>Selamat datang, ${nama}!</h3><p>Kode verifikasi pendaftaran Anda adalah: <b>${rawOtp}</b></p>`
    });

    logger.info({ email: maskEmail(email) }, 'OTP verifikasi registrasi berhasil dikirim');
    return res.status(201).json({ message: "OTP berhasil dikirim ke email Anda!" });
  } catch (error: any) {
    logger.error({ err: error?.message || 'Gagal mengirim email pendaftaran' }, 'ERROR DETAIL REGISTER');
    return res.status(500).json({ message: "Terjadi kesalahan server saat mendaftar." });
  }
}

export async function sendOtp(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email wajib diisi!" });
    }

    // 1. Anti-enumerasi: Jika email tidak terdaftar, balas 200 sama seperti jalur sukses tanpa kirim email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logger.info({ email: maskEmail(email), ip: req.ip }, 'Permintaan OTP untuk email tidak terdaftar (anti-enumerasi)');
      return res.status(200).json({ message: "Jika email terdaftar, kode OTP telah dikirim." });
    }

    // 2. Buat 6 Digit Kode OTP CSPRNG & Hash HMAC-SHA256
    const rawOtp = generateOtp();
    const otpHash = hashOtp(rawOtp);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // Hangus dalam 5 menit

    // 3. Simpan hash OTP ke database dan reset counter otpAttempts
    await prisma.user.update({
      where: { email },
      data: { otpCode: otpHash, otpExpires, otpAttempts: 0 },
    });

    // 4. Konfigurasi Pengirim Email
    const transporter = createMailTransport();

    const mailOptions = {
      from: getMailFrom('SIPMAS Keamanan'),
      to: email,
      subject: "Kode OTP Atur Ulang Kata Sandi",
      html: `<p>Anda menerima pesan ini karena Anda meminta atur ulang kata sandi.</p>
             <h3>Kode OTP Anda: <b>${rawOtp}</b></h3>
             <p>Kode ini hanya berlaku selama 5 menit. Jangan bagikan kode ini kepada siapapun.</p>`,
    };

    await transporter.sendMail(mailOptions);
    logger.info({ email: maskEmail(email) }, 'Kode OTP atur ulang kata sandi berhasil dikirim');

    return res.status(200).json({ message: "Jika email terdaftar, kode OTP telah dikirim." });
  } catch (error: any) {
    logger.error({ err: error?.message || 'Gagal mengirim OTP', ip: req.ip }, 'ERROR SEND OTP');
    return res.status(500).json({ message: "Gagal mengirim OTP." });
  }
}

export async function verifyRegister(req: Request, res: Response) {
  try {
    const { email, otpCode } = req.body;

    if (!email || !otpCode) {
      return res.status(400).json({ message: "Permintaan tidak valid." });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.otpCode || !user.otpExpires) {
      return res.status(400).json({ message: "Permintaan tidak valid." });
    }

    // Jika akun sudah mencapai 5 percobaan salah sebelumnya
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await prisma.user.update({
        where: { email },
        data: { otpCode: null, otpExpires: null },
      });
      return res.status(429).json({ message: "Terlalu banyak percobaan, minta kode baru" });
    }

    // Verifikasi hash OTP timing-safe
    const isOtpValid = verifyOtpHash(otpCode, user.otpCode);
    if (!isOtpValid) {
      const updatedUser = await prisma.user.update({
        where: { email },
        data: { otpAttempts: { increment: 1 } },
      });

      if (updatedUser.otpAttempts >= MAX_OTP_ATTEMPTS) {
        await prisma.user.update({
          where: { email },
          data: { otpCode: null, otpExpires: null },
        });
        return res.status(429).json({ message: "Terlalu banyak percobaan, minta kode baru" });
      }

      return res.status(401).json({ message: "Kode OTP salah!" });
    }

    if (new Date() > user.otpExpires) {
      return res.status(410).json({ message: "Kode OTP sudah hangus!" });
    }

    // Jika sukses, ubah status menjadi isVerified = true, bersihkan OTP dan reset counter
    await prisma.user.update({
      where: { email },
      data: { isVerified: true, otpCode: null, otpExpires: null, otpAttempts: 0 },
    });

    logger.info({ email: maskEmail(email) }, 'Akun berhasil diverifikasi lewat OTP');
    return res.status(200).json({ message: "Akun berhasil diverifikasi!" });
  } catch (error) {
    logger.error({ err: error, ip: req.ip }, 'ERROR VERIFY REGISTER');
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const { email, otpCode, newPassword } = req.body;

    if (!email || !otpCode || !newPassword) {
      return res.status(400).json({ message: "Semua kolom wajib diisi!" });
    }

    // Validasi panjang password minimal 8 karakter (setara register)
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Kata sandi harus minimal 8 karakter!" });
    }

    // 1. Cari user berdasarkan email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.otpCode || !user.otpExpires) {
      return res.status(400).json({ message: "Permintaan tidak valid." });
    }

    // Jika akun sudah mencapai 5 percobaan salah sebelumnya
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await prisma.user.update({
        where: { email },
        data: { otpCode: null, otpExpires: null },
      });
      return res.status(429).json({ message: "Terlalu banyak percobaan, minta kode baru" });
    }

    // 2. Validasi: Apakah kode OTP cocok dengan hash?
    const isOtpValid = verifyOtpHash(otpCode, user.otpCode);
    if (!isOtpValid) {
      const updatedUser = await prisma.user.update({
        where: { email },
        data: { otpAttempts: { increment: 1 } },
      });

      if (updatedUser.otpAttempts >= MAX_OTP_ATTEMPTS) {
        await prisma.user.update({
          where: { email },
          data: { otpCode: null, otpExpires: null },
        });
        return res.status(429).json({ message: "Terlalu banyak percobaan, minta kode baru" });
      }

      return res.status(401).json({ message: "Kode OTP yang Anda masukkan salah!" });
    }

    // 3. Validasi: Apakah kode OTP sudah kedaluwarsa?
    if (new Date() > user.otpExpires) {
      return res.status(410).json({ message: "Kode OTP sudah hangus! Silakan minta kode baru." });
    }

    // 4. Hash password baru
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 5. Update password, bersihkan kolom OTP, reset counter, dan verifikasi akun
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        otpCode: null,
        otpExpires: null,
        otpAttempts: 0,
        tokenVersion: { increment: 1 },
        isVerified: true,
      },
    });

    logger.info({ email: maskEmail(email) }, 'Kata sandi berhasil diperbarui');
    return res.status(200).json({ message: "Kata sandi berhasil diperbarui!" });
  } catch (error) {
    logger.error({ err: error, ip: req.ip }, 'ERROR RESET PASSWORD');
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
}

