/**
 * PERINGATAN PENTING:
 * Skrip ini HANYA UNTUK LINGKUNGAN PENGEMBANGAN (development / testing lokal).
 * DILARANG KERAS dijalankan pada lingkungan produksi.
 */
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma';
import riwayatRoutes from '../src/modules/riwayat/riwayat.routes';

async function main() {
  console.log('====================================================');
  console.log('🚀 SMOKE TEST FASE 22: HALAMAN DETAIL & RIWAYAT RINGKAS');
  console.log('====================================================\n');

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  // 0. Verifikasi lingkungan: skrip berhenti bila DATABASE_URL tidak mengarah ke db_sipmas
  const databaseUrl = process.env.DATABASE_URL || '';
  let dbName = '';
  try {
    const parsedUrl = new URL(databaseUrl);
    dbName = parsedUrl.pathname.replace(/^\//, '');
  } catch {
    const match = databaseUrl.match(/\/([^/?]+)(\?|$)/);
    if (match) dbName = match[1];
  }

  if (dbName !== 'db_sipmas') {
    console.error(`\n❌ FATAL: DATABASE_URL tidak mengarah ke database "db_sipmas" (terdeteksi: "${dbName || 'kosong'}").`);
    console.error('Skrip ini HANYA boleh dijalankan pada lingkungan pengembangan dengan database db_sipmas.');
    process.exit(1);
  }

  const createdSmokeUserIds: number[] = [];
  const createdLaporanIds: number[] = [];

  // Setup Express test app
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/riwayat', riwayatRoutes);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5002;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Mempersiapkan Dua Akun Warga Pengujian
    console.log('--- 1. Mempersiapkan Dua Akun Warga Pengujian ---');

    let wargaA = await prisma.user.findFirst({ where: { email: 'warga_a.smoke22@sipmas.go.id' } });
    if (!wargaA) {
      wargaA = await prisma.user.create({
        data: {
          nama: 'Warga A Pengujian',
          email: 'warga_a.smoke22@sipmas.go.id',
          password: 'hashed_password_smoke22',
          nik: '3672000000000021',
          role: 'WARGA',
          isVerified: true,
          tokenVersion: 1,
        },
      });
      createdSmokeUserIds.push(wargaA.id);
    }

    let wargaB = await prisma.user.findFirst({ where: { email: 'warga_b.smoke22@sipmas.go.id' } });
    if (!wargaB) {
      wargaB = await prisma.user.create({
        data: {
          nama: 'Warga B Pengujian',
          email: 'warga_b.smoke22@sipmas.go.id',
          password: 'hashed_password_smoke22',
          nik: '3672000000000022',
          role: 'WARGA',
          isVerified: true,
          tokenVersion: 1,
        },
      });
      createdSmokeUserIds.push(wargaB.id);
    }

    console.log(`✅ Warga A siap: ${wargaA.nama} (ID: ${wargaA.id}, Email: ${wargaA.email})`);
    console.log(`✅ Warga B siap: ${wargaB.nama} (ID: ${wargaB.id}, Email: ${wargaB.email})`);

    // Token JWT (authGuard mengecek claim 'tv' untuk tokenVersion)
    const tokenA = jwt.sign(
      { id: wargaA.id, role: wargaA.role, tv: wargaA.tokenVersion, email: wargaA.email },
      jwtSecret,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    const tokenB = jwt.sign(
      { id: wargaB.id, role: wargaB.role, tv: wargaB.tokenVersion, email: wargaB.email },
      jwtSecret,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    // 2. Mempersiapkan Laporan Milik Warga A
    console.log('\n--- 2. Mempersiapkan Data Laporan Uji Milik Warga A ---');

    // Laporan 1: Infrastruktur Selesai (Ada foto awal & fotoSelesai Sebelum/Sesudah)
    const lapInfrastruktur = await prisma.laporan.create({
      data: {
        userId: wargaA.id,
        judul: 'Jalan Ambles di Depan Pasar Kranggot',
        isi: 'Kategori: Infrastruktur\nLokasi: Pasar Kranggot Blok A\nTanggal: 2026-11-01\n\nJalan aspal ambles sekitar kedalaman 30 cm membahayakan pengendara motor.',
        kategori: 'Infrastruktur',
        lokasi: 'Pasar Kranggot Blok A',
        tanggalKejadian: new Date('2026-11-01'),
        status: 'SELESAI',
        foto: '/uploads/jalan-ambles-sebelum.jpg',
        fotoSelesai: '/uploads/jalan-ambles-sesudah.jpg',
        catatanSelesai: 'Perbaikan jalan dan penambalan aspal telah rampung dilaksanakan oleh Dinas PU.',
        selesaiAt: new Date(),
      },
    });
    createdLaporanIds.push(lapInfrastruktur.id);

    // Laporan 2: Pelayanan Selesai (Hanya tanggapan tanpa fotoSelesai)
    const lapPelayanan = await prisma.laporan.create({
      data: {
        userId: wargaA.id,
        judul: 'Antrean Pelayanan KTP Elektronik Menumpuk',
        isi: 'Kategori: Pelayanan\nLokasi: Kantor Kelurahan Sukmajaya\nTanggal: 2026-11-02\n\nSistem antrean manual menyebabkan kerumunan warga sejak pagi hari.',
        kategori: 'Pelayanan',
        lokasi: 'Kantor Kelurahan Sukmajaya',
        tanggalKejadian: new Date('2026-11-02'),
        status: 'SELESAI',
        foto: null,
        fotoSelesai: null,
        catatanSelesai: 'Nomor antrean telah didigitalisasi dan loket pelayanan dibuka menjadi 3 loket aktif.',
        selesaiAt: new Date(),
      },
    });
    createdLaporanIds.push(lapPelayanan.id);

    // Laporan 3: Lingkungan PENDING (Ada foto lampiran, belum selesai)
    const lapLingkungan = await prisma.laporan.create({
      data: {
        userId: wargaA.id,
        judul: 'Tumpukan Sampah Liar di Pinggir Saluran Irigasi',
        isi: 'Kategori: Lingkungan\nLokasi: Saluran Irigasi Sukamaju\nTanggal: 2026-11-03\n\nSampah plastik menyumbat aliran air menimbulkan bau menyengat.',
        kategori: 'Lingkungan',
        lokasi: 'Saluran Irigasi Sukamaju',
        tanggalKejadian: new Date('2026-11-03'),
        status: 'PENDING',
        foto: '/uploads/sampah-irigasi.jpg',
        fotoSelesai: null,
        catatanSelesai: null,
        selesaiAt: null,
      },
    });
    createdLaporanIds.push(lapLingkungan.id);

    console.log(`✅ Laporan 1 (Infrastruktur Selesai, Ada Sebelum & Sesudah): ID ${lapInfrastruktur.id}`);
    console.log(`✅ Laporan 2 (Pelayanan Selesai, Tanggapan saja): ID ${lapPelayanan.id}`);
    console.log(`✅ Laporan 3 (Lingkungan PENDING, Ada Lampiran): ID ${lapLingkungan.id}`);

    // 3. Uji GET /api/riwayat Warga A (Daftar Ringkas)
    console.log('\n--- 3. Pengujian GET /api/riwayat (Daftar Ringkas Warga A) ---');
    const resRiwayat = await fetch(`${baseUrl}/api/riwayat`, {
      headers: { Cookie: `token=${tokenA}` },
    });
    if (resRiwayat.status !== 200) {
      throw new Error(`Gagal mengambil riwayat Warga A. Status: ${resRiwayat.status}`);
    }
    const daftarRiwayat = await resRiwayat.json();
    console.log(`✅ GET /api/riwayat mengembalikan ${daftarRiwayat.length} laporan untuk Warga A.`);

    // Verifikasi penanda di daftar ringkas
    const item1 = daftarRiwayat.find((l: any) => l.id === lapInfrastruktur.id);
    const item2 = daftarRiwayat.find((l: any) => l.id === lapPelayanan.id);
    const item3 = daftarRiwayat.find((l: any) => l.id === lapLingkungan.id);

    // Item 1: Ada lampiran (foto) && Ada tanggapan (status SELESAI + catatanSelesai)
    const item1HasLampiran = Boolean(item1.foto);
    const item1HasTanggapan = item1.status === 'SELESAI' && Boolean(item1.catatanSelesai);
    if (!item1HasLampiran || !item1HasTanggapan) {
      throw new Error('Penanda Item 1 tidak sesuai (harus ada lampiran & tanggapan)');
    }
    console.log(`✅ Item 1 [Infrastruktur Selesai]: Penanda "Ada lampiran" = ${item1HasLampiran}, "Ada tanggapan" = ${item1HasTanggapan}`);

    // Item 2: TIDAK ada lampiran (foto null) && Ada tanggapan
    const item2HasLampiran = Boolean(item2.foto);
    const item2HasTanggapan = item2.status === 'SELESAI' && Boolean(item2.catatanSelesai);
    if (item2HasLampiran || !item2HasTanggapan) {
      throw new Error('Penanda Item 2 tidak sesuai (harus tanggapan saja tanpa lampiran)');
    }
    console.log(`✅ Item 2 [Pelayanan Selesai]: Penanda "Ada lampiran" = ${item2HasLampiran}, "Ada tanggapan" = ${item2HasTanggapan}`);

    // Item 3: Ada lampiran && TIDAK ada tanggapan
    const item3HasLampiran = Boolean(item3.foto);
    const item3HasTanggapan = item3.status === 'SELESAI' && Boolean(item3.catatanSelesai);
    if (!item3HasLampiran || item3HasTanggapan) {
      throw new Error('Penanda Item 3 tidak sesuai (harus lampiran saja tanpa tanggapan)');
    }
    console.log(`✅ Item 3 [Lingkungan PENDING]: Penanda "Ada lampiran" = ${item3HasLampiran}, "Ada tanggapan" = ${item3HasTanggapan}`);

    // 4. Uji GET /api/riwayat/:id Warga A (Detail Laporan Selesai)
    console.log('\n--- 4. Pengujian GET /api/riwayat/:id (Warga A Buka Laporan Milik Sendiri) ---');

    // 4a. Detail Laporan 1: Infrastruktur Selesai (Sebelum & Sesudah)
    const resDet1 = await fetch(`${baseUrl}/api/riwayat/${lapInfrastruktur.id}`, {
      headers: { Cookie: `token=${tokenA}` },
    });
    console.log(`[Warga A buka Laporan 1] Status: ${resDet1.status} (Diharapkan: 200)`);
    if (resDet1.status !== 200) throw new Error('Harusnya 200 OK');
    const det1 = await resDet1.json();
    if (!det1.foto || !det1.fotoSelesai || !det1.catatanSelesai || !det1.selesaiAt) {
      throw new Error('Payload detail Laporan 1 tidak lengkap');
    }
    console.log(`  -> Foto lampiran: "${det1.foto}", Foto selesai: "${det1.fotoSelesai}" (Mendukung Sebelum/Sesudah)`);
    console.log(`  -> Catatan: "${det1.catatanSelesai.substring(0, 35)}..."`);

    // 4b. Detail Laporan 2: Pelayanan Selesai (Tanggapan saja)
    const resDet2 = await fetch(`${baseUrl}/api/riwayat/${lapPelayanan.id}`, {
      headers: { Cookie: `token=${tokenA}` },
    });
    console.log(`[Warga A buka Laporan 2] Status: ${resDet2.status} (Diharapkan: 200)`);
    if (resDet2.status !== 200) throw new Error('Harusnya 200 OK');
    const det2 = await resDet2.json();
    if (det2.foto !== null || det2.fotoSelesai !== null || !det2.catatanSelesai) {
      throw new Error('Payload detail Laporan 2 tidak sesuai format pelayanan tanpa foto');
    }
    console.log(`  -> Foto lampiran: ${det2.foto}, Foto bukti: ${det2.fotoSelesai}`);
    console.log(`  -> Catatan: "${det2.catatanSelesai.substring(0, 35)}..." (Hanya tanggapan)`);

    // 5. Uji Proteksi IDOR: Warga B Membuka Detail Milik Warga A
    console.log('\n--- 5. Pengujian Proteksi IDOR (Warga B Buka Laporan Milik Warga A) ---');
    const resIdor = await fetch(`${baseUrl}/api/riwayat/${lapInfrastruktur.id}`, {
      headers: { Cookie: `token=${tokenB}` },
    });
    console.log(`[Warga B buka Laporan 1 milik Warga A] Status: ${resIdor.status} (Diharapkan: 404)`);
    if (resIdor.status !== 404) throw new Error(`Harusnya 404 Not Found, didapat ${resIdor.status}`);
    const idorBody = await resIdor.json();
    const idorMsg = idorBody.message || idorBody.error;
    console.log(`  -> Pesan balasan: "${idorMsg}" (Identik dengan laporan tidak ada)`);
    if (idorMsg !== 'Laporan tidak ditemukan.') {
      throw new Error('Pesan error IDOR harus "Laporan tidak ditemukan."');
    }

    // 6. Uji Penanganan Kesalahan ID (Tidak Ada, Bukan Angka, Negatif, Nol, Tanpa Login)
    console.log('\n--- 6. Pengujian Validasi Parameter ID & Autentikasi ---');

    // 6a. ID tidak ada (999999)
    const res404 = await fetch(`${baseUrl}/api/riwayat/999999`, {
      headers: { Cookie: `token=${tokenA}` },
    });
    console.log(`[ID 999999 tidak ada] Status: ${res404.status} (Diharapkan: 404)`);
    if (res404.status !== 404) throw new Error('Harusnya 404');
    const body404 = await res404.json();
    const msg404 = body404.message || body404.error;
    if (msg404 !== 'Laporan tidak ditemukan.') throw new Error('Pesan error 404 salah');

    // 6b. ID bukan angka ("abc")
    const resBukanAngka = await fetch(`${baseUrl}/api/riwayat/bukan-angka`, {
      headers: { Cookie: `token=${tokenA}` },
    });
    console.log(`[ID bukan angka "bukan-angka"] Status: ${resBukanAngka.status} (Diharapkan: 400)`);
    if (resBukanAngka.status !== 400) throw new Error('Harusnya 400');
    const bodyBukanAngka = await resBukanAngka.json();
    const msgBukanAngka = bodyBukanAngka.message || bodyBukanAngka.error;
    console.log(`  -> Pesan: "${msgBukanAngka}"`);

    // 6c. ID negatif ("-15")
    const resNegatif = await fetch(`${baseUrl}/api/riwayat/-15`, {
      headers: { Cookie: `token=${tokenA}` },
    });
    console.log(`[ID negatif "-15"] Status: ${resNegatif.status} (Diharapkan: 400)`);
    if (resNegatif.status !== 400) throw new Error('Harusnya 400');

    // 6d. ID nol ("0")
    const resNol = await fetch(`${baseUrl}/api/riwayat/0`, {
      headers: { Cookie: `token=${tokenA}` },
    });
    console.log(`[ID nol "0"] Status: ${resNol.status} (Diharapkan: 400)`);
    if (resNol.status !== 400) throw new Error('Harusnya 400');

    // 6e. Tanpa token autentikasi
    const resNoAuth = await fetch(`${baseUrl}/api/riwayat/${lapInfrastruktur.id}`);
    console.log(`[Tanpa login] Status: ${resNoAuth.status} (Diharapkan: 401)`);
    if (resNoAuth.status !== 401) throw new Error('Harusnya 401');

    console.log('\n====================================================');
    console.log('🎉 SELURUH SKENARIO SMOKE TEST FASE 22 LULUS 100%!');
    console.log('====================================================');
  } finally {
    console.log('\n--- Membersihkan Data Uji Smoke Test ---');
    if (createdLaporanIds.length > 0) {
      await prisma.laporan.deleteMany({
        where: { id: { in: createdLaporanIds } },
      });
      console.log(`🧹 Dihapus ${createdLaporanIds.length} laporan uji dari database.`);
    }

    if (createdSmokeUserIds.length > 0) {
      const deletedUsers = await prisma.user.deleteMany({
        where: {
          id: { in: createdSmokeUserIds },
          email: { endsWith: '.smoke22@sipmas.go.id' },
        },
      });
      console.log(`🧹 Dihapus ${deletedUsers.count} akun uji .smoke22@sipmas.go.id dari database.`);
    }

    server.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ Smoke Test Gagal:', err);
  process.exit(1);
});
