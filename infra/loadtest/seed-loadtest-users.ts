import bcrypt from 'bcryptjs';
import { getSafeDatabaseUrl, createSafePrismaClient } from './db-helper';

async function seedLoadtestUsers() {
  console.log('=== SEED AKUN UJI BEBAN (LOAD TEST) ===\n');

  // 1. Validasi keamanan lingkungan dan database
  const dbUrl = getSafeDatabaseUrl();

  // 2. Validasi kata sandi uji dari variabel lingkungan (tidak di-hardcode)
  const rawPassword = process.env.LOADTEST_PASSWORD;
  if (!rawPassword || rawPassword.trim().length === 0) {
    console.error('❌ DITOLAK: Variabel lingkungan LOADTEST_PASSWORD wajib diset sebelum menjalankan seed!');
    console.error('   Contoh: LOADTEST_PASSWORD="SandiUji123!" pnpm loadtest:seed');
    process.exit(1);
  }

  // 3. Tentukan jumlah akun uji (default 60, atau argumen CLI / environment)
  const userCountArg = process.argv[2] ? parseInt(process.argv[2], 10) : NaN;
  const envCount = process.env.LOADTEST_USERS_COUNT ? parseInt(process.env.LOADTEST_USERS_COUNT, 10) : NaN;
  const count = (!isNaN(userCountArg) && userCountArg > 0) ? userCountArg : (!isNaN(envCount) && envCount > 0 ? envCount : 60);

  if (count > 500) {
    console.error('❌ DITOLAK: Jumlah akun uji maksimal adalah 500 untuk keamanan sumber daya.');
    process.exit(1);
  }

  console.log(`Menyiapkan ${count} akun uji beban di database db_sipmas...`);

  // Buat koneksi Prisma yang aman
  let prisma = createSafePrismaClient(dbUrl);

  try {
    // Uji koneksi pertama; jika gagal pada port default (misal 3306), coba port 3307
    try {
      await prisma.$connect();
    } catch (connErr) {
      if (dbUrl.includes(':3306/')) {
        const fallbackUrl = dbUrl.replace(':3306/', ':3307/');
        console.log('Koneksi port 3306 tidak merespons, mencoba port 3307 (kontainer sipmas-mysql)...');
        await prisma.$disconnect();
        prisma = createSafePrismaClient(fallbackUrl);
        await prisma.$connect();
      } else {
        throw connErr;
      }
    }

    // 4. Hash kata sandi menggunakan bcryptjs (salt 10, mekanisme identik dengan aplikasi)
    console.log('Menghasilkan hash kata sandi aman (bcrypt salt 10)...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 5. Buat atau perbarui akun-akun uji
    let createdCount = 0;
    let updatedCount = 0;
    let seededLaporanCount = 0;

    for (let i = 1; i <= count; i++) {
      const email = `loadtest-${i}@example.test`;
      const nik = `999900000000${String(i).padStart(4, '0')}`;
      const nama = `Warga Uji Beban ${i}`;

      const user = await prisma.user.upsert({
        where: { email },
        update: {
          password: hashedPassword,
          isVerified: true,
          otpCode: null,
          otpAttempts: 0,
        },
        create: {
          nik,
          nama,
          email,
          password: hashedPassword,
          role: 'WARGA',
          isVerified: true,
        },
      });

      if (user.createdAt.getTime() === user.updatedAt.getTime()) {
        createdCount++;
      } else {
        updatedCount++;
      }

      // Pastikan ada minimal 1 laporan awal agar user uji memiliki riwayat untuk dibaca pada skenario GET /api/riwayat/:id
      const existingLaporan = await prisma.laporan.findFirst({
        where: { userId: user.id },
      });

      if (!existingLaporan) {
        await prisma.laporan.create({
          data: {
            judul: `Laporan Awal Uji Beban User ${i}`,
            isi: `Ini adalah laporan pengaduan infrastruktur jalan rusak awal untuk pengguna uji ${i} agar dapat diuji riwayatnya.`,
            kategori: 'Infrastruktur',
            lokasi: `Kecamatan Uji ${((i - 1) % 8) + 1}`,
            tanggalKejadian: new Date(),
            status: 'PENDING',
            userId: user.id,
          },
        });
        seededLaporanCount++;
      }
    }

    console.log('\n✅ SEED AKUN UJI BERHASIL!');
    console.log(` - Total akun uji siap: ${count} (Dibuat baru: ${createdCount}, Diperbarui: ${updatedCount})`);
    console.log(` - Pola email: loadtest-1@example.test s/d loadtest-${count}@example.test`);
    console.log(` - Status verifikasi: isVerified=true`);
    console.log(` - Laporan awal di-seed: ${seededLaporanCount}`);
    console.log(' - Kata sandi: Tersimpan dalam bentuk hash bcrypt (tidak dicetak demi keamanan).');
  } catch (err: any) {
    console.error('❌ Gagal melakukan seeding akun uji:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedLoadtestUsers().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
