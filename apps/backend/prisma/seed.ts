import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminNik = process.env.ADMIN_NIK;
  const adminNama = process.env.ADMIN_NAMA;

  const missingEnvVars: string[] = [];
  if (!adminEmail || adminEmail.trim() === '') missingEnvVars.push('ADMIN_EMAIL');
  if (!adminPassword || adminPassword.trim() === '') missingEnvVars.push('ADMIN_PASSWORD');
  if (!adminNik || adminNik.trim() === '') missingEnvVars.push('ADMIN_NIK');
  if (!adminNama || adminNama.trim() === '') missingEnvVars.push('ADMIN_NAMA');

  if (missingEnvVars.length > 0) {
    console.error(
      `[Seed] FATAL: Variabel lingkungan berikut wajib diset dan tidak boleh kosong: ${missingEnvVars.join(', ')}.`
    );
    console.error(
      `[Seed] Silakan tentukan nilai variabel tersebut pada file .env sebelum menjalankan seed.`
    );
    process.exit(1);
  }

  console.log(`[Seed] Memeriksa akun admin di database...`);

  // 1. Cek apakah user dengan role ADMIN sudah ada
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (existingAdmin) {
    console.log(`[Seed] Akun admin sudah ada (email: ${existingAdmin.email}, id: ${existingAdmin.id}). Melewati pembuatan admin baru (idempotent).`);
    return;
  }

  // 2. Hash password menggunakan bcrypt (salt rounds: 10, pola sama dengan auth.controller.ts)
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  // 3. Buat akun admin baru
  const newAdmin = await prisma.user.create({
    data: {
      nik: adminNik,
      nama: adminNama,
      email: adminEmail,
      password: hashedPassword,
      role: 'ADMIN',
      isVerified: true,
    },
  });

  console.log(`[Seed] Akun admin berhasil dibuat:`);
  console.log(`       - Email : ${newAdmin.email}`);
  console.log(`       - Nama  : ${newAdmin.nama}`);
  console.log(`       - Role  : ${newAdmin.role}`);
  console.log(`       - ID    : ${newAdmin.id}`);
}

main()
  .catch((e) => {
    console.error('[Seed] Terjadi error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
