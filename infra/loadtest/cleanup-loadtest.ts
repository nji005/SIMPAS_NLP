import fs from 'fs';
import path from 'path';
import { getSafeDatabaseUrl, createSafePrismaClient } from './db-helper';

async function cleanupLoadtest() {
  console.log('=== PEMBERSIHAN DATA UJI BEBAN (LOAD TEST) ===\n');

  // 1. Validasi keamanan lingkungan dan database
  const dbUrl = getSafeDatabaseUrl();
  console.log('Memeriksa dan membersihkan akun uji beban pada database db_sipmas...');

  let prisma = createSafePrismaClient(dbUrl);

  try {
    // Uji koneksi pertama; jika gagal pada port default (3306), coba port 3307
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

    // 2. Cari semua akun uji beban dengan pola email loadtest-*@example.test
    const testUsers = await prisma.user.findMany({
      where: {
        email: {
          startsWith: 'loadtest-',
          endsWith: '@example.test',
        },
      },
      select: { id: true, email: true },
    });

    if (testUsers.length === 0) {
      console.log('ℹ️ Tidak ditemukan akun uji loadtest-*@example.test di database db_sipmas.');
      console.log('   Kondisi database sudah bersih.');
      return;
    }

    const userIds = testUsers.map((u) => u.id);
    console.log(`Ditemukan ${testUsers.length} akun uji beban untuk dibersihkan.`);

    // 3. Cari dan hapus berkas foto fisik milik laporan uji (jika ada)
    const testLaporan = await prisma.laporan.findMany({
      where: {
        userId: { in: userIds },
      },
      select: {
        id: true,
        foto: true,
        fotoSelesai: true,
      },
    });

    let deletedFilesCount = 0;
    const uploadsDir = path.resolve(process.cwd(), 'apps/backend/public/uploads');

    for (const lap of testLaporan) {
      for (const fotoPath of [lap.foto, lap.fotoSelesai]) {
        if (fotoPath && typeof fotoPath === 'string' && fotoPath.startsWith('/uploads/')) {
          const filename = path.basename(fotoPath);
          const fullPath = path.join(uploadsDir, filename);
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
              deletedFilesCount++;
            } catch (err: any) {
              console.warn(`Peringatan: Gagal menghapus berkas foto ${filename}: ${err.message}`);
            }
          }
        }
      }
    }

    // 4. Hapus data laporan uji dari database
    const delLaporan = await prisma.laporan.deleteMany({
      where: {
        userId: { in: userIds },
      },
    });

    // 5. Hapus akun pengguna uji dari database
    const delUsers = await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });

    // 6. Verifikasi akhir bahwa tidak ada lagi akun loadtest-* yang tersisa
    const remainingCount = await prisma.user.count({
      where: {
        email: {
          startsWith: 'loadtest-',
          endsWith: '@example.test',
        },
      },
    });

    console.log('\n✅ PEMBERSIHAN SELESAI!');
    console.log(` - Akun pengguna uji dihapus: ${delUsers.count}`);
    console.log(` - Laporan aduan uji dihapus: ${delLaporan.count}`);
    console.log(` - Berkas foto uji dihapus: ${deletedFilesCount}`);
    console.log(` - Sisa akun loadtest di database: ${remainingCount}`);

    if (remainingCount !== 0) {
      console.error(`⚠️ PERINGATAN: Masih tersisa ${remainingCount} akun uji di database!`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Gagal melakukan pembersihan data uji:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupLoadtest().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
