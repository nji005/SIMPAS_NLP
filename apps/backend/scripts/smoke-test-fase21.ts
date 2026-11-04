/**
 * PERINGATAN PENTING:
 * Skrip ini HANYA UNTUK LINGKUNGAN PENGEMBANGAN (development / testing lokal).
 * DILARANG KERAS dijalankan pada lingkungan produksi.
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import prisma from '../src/lib/prisma';

// Import express app
// Note: server.ts calls app.listen on process.env.PORT, so we can interact via supertest-like fetch or directly test controllers & endpoints.
import express from 'express';
import cookieParser from 'cookie-parser';
import adminRoutes from '../src/modules/admin/admin.routes';
import { authGuard } from '../src/middlewares/authGuard';
import { roleGuard } from '../src/middlewares/roleGuard';
import { storageService } from '../src/services/storageService';

async function main() {
  console.log('====================================================');
  console.log('🚀 SMOKE TEST FASE 21: BUKTI PENYELESAIAN LAPORAN');
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

  // 1. Setup Users in DB
  console.log('--- 1. Mempersiapkan Akun Pengujian ---');
  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        nama: 'Admin Utama SIPMAS',
        email: 'admin.smoke@sipmas.go.id',
        password: 'hashed_password_smoke',
        nik: '3672000000000001',
        role: 'ADMIN',
        isVerified: true,
      },
    });
    if (admin.email.endsWith('.smoke@sipmas.go.id')) {
      createdSmokeUserIds.push(admin.id);
    }
  } else if (!admin.isVerified) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { isVerified: true },
    });
  }
  console.log(`✅ Admin teridentifikasi: ${admin.nama} (${admin.email}, ID: ${admin.id})`);

  let warga1 = await prisma.user.findFirst({ where: { email: 'warga1.smoke@sipmas.go.id' } });
  if (!warga1) {
    warga1 = await prisma.user.create({
      data: {
        nama: 'Budi Santoso (Warga 1)',
        email: 'warga1.smoke@sipmas.go.id',
        password: 'hashed_password_smoke',
        nik: '3672010101900001',
        role: 'WARGA',
        isVerified: true,
      },
    });
    if (warga1.email.endsWith('.smoke@sipmas.go.id')) {
      createdSmokeUserIds.push(warga1.id);
    }
  } else if (!warga1.isVerified) {
    warga1 = await prisma.user.update({
      where: { id: warga1.id },
      data: { isVerified: true },
    });
  }
  console.log(`✅ Warga 1 teridentifikasi: ${warga1.nama} (${warga1.email}, ID: ${warga1.id})`);

  let warga2 = await prisma.user.findFirst({ where: { email: 'warga2.smoke@sipmas.go.id' } });
  if (!warga2) {
    warga2 = await prisma.user.create({
      data: {
        nama: 'Siti Rahma (Warga 2)',
        email: 'warga2.smoke@sipmas.go.id',
        password: 'hashed_password_smoke',
        nik: '3672010101900002',
        role: 'WARGA',
        isVerified: true,
      },
    });
    if (warga2.email.endsWith('.smoke@sipmas.go.id')) {
      createdSmokeUserIds.push(warga2.id);
    }
  } else if (!warga2.isVerified) {
    warga2 = await prisma.user.update({
      where: { id: warga2.id },
      data: { isVerified: true },
    });
  }
  console.log(`✅ Warga 2 teridentifikasi: ${warga2.nama} (${warga2.email}, ID: ${warga2.id})`);

  // Tokens (using tv for tokenVersion per authGuard)
  const adminToken = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, tv: admin.tokenVersion },
    jwtSecret
  );
  const warga1Token = jwt.sign(
    { id: warga1.id, email: warga1.email, role: warga1.role, tv: warga1.tokenVersion },
    jwtSecret
  );
  const warga2Token = jwt.sign(
    { id: warga2.id, email: warga2.email, role: warga2.role, tv: warga2.tokenVersion },
    jwtSecret
  );

  // Setup test express server on an ephemeral port
  const testApp = express();
  testApp.use(cookieParser());
  testApp.use(express.json());
  testApp.use(express.urlencoded({ extended: true }));

  // Register protected upload route
  testApp.get('/uploads/:filename', authGuard, async (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const user = (req as any).user;

      if (user.role !== 'ADMIN') {
        const expectedPath = `/uploads/${filename}`;
        const laporan = await prisma.laporan.findFirst({
          where: {
            userId: user.id,
            OR: [{ foto: expectedPath }, { fotoSelesai: expectedPath }],
          },
        });

        if (!laporan) {
          return res.status(404).json({ error: 'Not Found', message: 'Berkas tidak ditemukan' });
        }
      }

      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      const filePath = path.resolve(uploadsDir, filename);

      if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Not Found', message: 'Berkas tidak ditemukan di storage' });
      }

      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Register admin routes
  testApp.use('/api/admin', authGuard, roleGuard('ADMIN'), adminRoutes);

  // Start test server on random port
  const server = testApp.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`\n✅ Test Express Server aktif pada: ${baseUrl}\n`);

  // Buat file gambar uji
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const sampleImageBuffer = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 50, g: 150, b: 250 },
    },
  })
    .jpeg()
    .toBuffer();

  const fotoAwalFilename = `smoke-sebelum-${Date.now()}.jpg`;
  const fotoAwalPath = path.join(uploadsDir, fotoAwalFilename);
  fs.writeFileSync(fotoAwalPath, sampleImageBuffer);

  const proofImageBuffer = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 50, g: 220, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();

  let createdLaporanIds: number[] = [];
  let uploadedProofFiles: string[] = [];

  try {
    // ------------------------------------------------------------------------------------
    // SKENARIO 1: Selesai tanpa tanggapan ditolak
    // ------------------------------------------------------------------------------------
    console.log('--- 2. Pengujian Validasi: Selesai Tanpa Tanggapan Ditolak ---');

    const laporantemp = await prisma.laporan.create({
      data: {
        judul: 'Uji Jalan Rusak Smoke Test',
        isi: '[KATEGORI: Infrastruktur]\n[TANGGAL: 2026-11-03]\n[LOKASI: Jl. Protokol No. 1]\nJalan amblas dan berlubang membahayakan.',
        kategori: 'Infrastruktur',
        lokasi: 'Jl. Protokol No. 1',
        status: 'PROSES',
        foto: `/uploads/${fotoAwalFilename}`,
        userId: warga1.id,
      },
    });
    createdLaporanIds.push(laporantemp.id);

    // 2.a Request tanpa catatanSelesai
    const resNoNote = await fetch(`${baseUrl}/api/admin/laporan/${laporantemp.id}/selesai`, {
      method: 'POST',
      headers: {
        Cookie: `token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const dataNoNote = await resNoNote.json();
    console.log(`[POST /selesai tanpa catatan] Status: ${resNoNote.status} (Diharapkan 400)`);
    if (resNoNote.status !== 400) throw new Error('Harusnya ditolak 400 jika catatan kosong');
    console.log(`  -> Pesan validasi: "${dataNoNote.message}"`);

    // 2.b Request catatan < 10 karakter
    const resShortNote = await fetch(`${baseUrl}/api/admin/laporan/${laporantemp.id}/selesai`, {
      method: 'POST',
      headers: {
        Cookie: `token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ catatanSelesai: 'Singkat' }),
    });
    const dataShortNote = await resShortNote.json();
    console.log(`[POST /selesai catatan pendek] Status: ${resShortNote.status} (Diharapkan 400)`);
    if (resShortNote.status !== 400) throw new Error('Harusnya ditolak 400 jika catatan < 10 karakter');
    console.log(`  -> Pesan validasi: "${dataShortNote.message}"`);

    // 2.c PATCH biasa mencoba kirim status SELESAI
    const resPatchSelesai = await fetch(`${baseUrl}/api/admin/laporan`, {
      method: 'PATCH',
      headers: {
        Cookie: `token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: laporantemp.id, status: 'SELESAI' }),
    });
    const dataPatchSelesai = await resPatchSelesai.json();
    console.log(`[PATCH biasa status SELESAI] Status: ${resPatchSelesai.status} (Diharapkan 400)`);
    if (resPatchSelesai.status !== 400) throw new Error('Harusnya ditolak 400 pada PATCH biasa');
    console.log(`  -> Pesan validasi: "${dataPatchSelesai.message}"`);

    // ------------------------------------------------------------------------------------
    // SKENARIO 2: Laporan Infrastruktur dengan Foto Sebelum dan Sesudah
    // ------------------------------------------------------------------------------------
    console.log('\n--- 3. Pengujian: Laporan Infrastruktur dengan Foto Sebelum & Sesudah ---');

    // Buat form-data multipart dengan catatanSelesai + foto
    const boundary = '----WebKitFormBoundarySmokeTest' + Date.now();
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="catatanSelesai"\r\n\r\nPerbaikan jalan amblas telah rampung dikerjakan oleh tim dinas PUPR.\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="foto"; filename="bukti-sesudah.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ];

    const part1 = Buffer.from(parts[0], 'utf-8');
    const part2 = Buffer.from(parts[1], 'utf-8');
    const part3 = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const multipartBody = Buffer.concat([part1, part2, proofImageBuffer, part3]);

    const resSelesaikanWithPhoto = await fetch(`${baseUrl}/api/admin/laporan/${laporantemp.id}/selesai`, {
      method: 'POST',
      headers: {
        Cookie: `token=${adminToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const dataSelesaikanWithPhoto = await resSelesaikanWithPhoto.json();
    console.log(`[POST /selesai dengan foto] Status: ${resSelesaikanWithPhoto.status} (Diharapkan 200)`);
    if (resSelesaikanWithPhoto.status !== 200) {
      throw new Error(`Gagal menyelesaikan laporan: ${JSON.stringify(dataSelesaikanWithPhoto)}`);
    }

    const updatedLaporan1 = await prisma.laporan.findUnique({ where: { id: laporantemp.id } });
    console.log('✅ Status DB:', updatedLaporan1?.status);
    console.log('✅ Catatan Selesai:', updatedLaporan1?.catatanSelesai);
    console.log('✅ Foto Sebelum:', updatedLaporan1?.foto);
    console.log('✅ Foto Sesudah:', updatedLaporan1?.fotoSelesai);
    console.log('✅ Waktu Selesai:', updatedLaporan1?.selesaiAt?.toISOString());

    if (!updatedLaporan1?.fotoSelesai) {
      throw new Error('fotoSelesai harus terisi!');
    }
    const buktiFilename = path.basename(updatedLaporan1.fotoSelesai);
    uploadedProofFiles.push(path.join(uploadsDir, buktiFilename));

    // ------------------------------------------------------------------------------------
    // SKENARIO 3: Otorisasi Akses Foto Bukti (IDOR Protection)
    // ------------------------------------------------------------------------------------
    console.log('\n--- 4. Pengujian: Otorisasi Akses Foto Bukti ---');

    // 4.a Pemilik aduan (Warga 1) membuka foto bukti penyelesaiannya sendiri
    const resOwnerAccess = await fetch(`${baseUrl}/uploads/${buktiFilename}`, {
      headers: { Cookie: `token=${warga1Token}` },
    });
    console.log(`[Warga 1 (Pemilik) akses bukti] Status: ${resOwnerAccess.status} (Diharapkan 200 OK)`);
    if (resOwnerAccess.status !== 200) throw new Error('Warga 1 seharusnya boleh akses foto buktinya');

    // 4.b Warga lain (Warga 2) mencoba membuka foto bukti milik Warga 1
    const resOtherWargaAccess = await fetch(`${baseUrl}/uploads/${buktiFilename}`, {
      headers: { Cookie: `token=${warga2Token}` },
    });
    console.log(`[Warga 2 (Warga Lain) akses bukti] Status: ${resOtherWargaAccess.status} (Diharapkan 404 Not Found)`);
    if (resOtherWargaAccess.status !== 404) throw new Error('Warga 2 harusnya DITOLAK 404 saat akses bukti orang lain');

    // 4.c Tamu tanpa login mencoba akses
    const resAnonAccess = await fetch(`${baseUrl}/uploads/${buktiFilename}`);
    console.log(`[Anonim tanpa login akses bukti] Status: ${resAnonAccess.status} (Diharapkan 401 Unauthorized)`);
    if (resAnonAccess.status !== 401) throw new Error('Anonim harusnya DITOLAK 401');

    // 4.d Admin membuka foto bukti
    const resAdminAccess = await fetch(`${baseUrl}/uploads/${buktiFilename}`, {
      headers: { Cookie: `token=${adminToken}` },
    });
    console.log(`[Admin akses bukti] Status: ${resAdminAccess.status} (Diharapkan 200 OK)`);
    if (resAdminAccess.status !== 200) throw new Error('Admin harusnya diizinkan 200');

    // ------------------------------------------------------------------------------------
    // SKENARIO 4: Laporan Pelayanan dengan Tanggapan Saja (Tanpa Foto)
    // ------------------------------------------------------------------------------------
    console.log('\n--- 5. Pengujian: Laporan Pelayanan dengan Tanggapan Saja ---');

    const laporanPelayanan = await prisma.laporan.create({
      data: {
        judul: 'Antrean Pelayanan KTP Kelurahan Padat',
        isi: '[KATEGORI: Pelayanan]\n[TANGGAL: 2026-11-03]\n[LOKASI: Kantor Kelurahan]\nNomor antrean habis sejak jam 8 pagi, pelayanan lambat.',
        kategori: 'Pelayanan',
        lokasi: 'Kantor Kelurahan',
        status: 'PROSES',
        foto: null,
        userId: warga1.id,
      },
    });
    createdLaporanIds.push(laporanPelayanan.id);

    const resSelesaikanPelayanan = await fetch(`${baseUrl}/api/admin/laporan/${laporanPelayanan.id}/selesai`, {
      method: 'POST',
      headers: {
        Cookie: `token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        catatanSelesai: 'Telah dikoordinasikan dengan pihak kelurahan, loket layanan kini ditambah 2 unit dan sistem antrean online diaktifkan.',
      }),
    });

    const dataSelesaikanPelayanan = await resSelesaikanPelayanan.json();
    console.log(`[POST /selesai Pelayanan (tanpa foto)] Status: ${resSelesaikanPelayanan.status} (Diharapkan 200)`);
    if (resSelesaikanPelayanan.status !== 200) {
      throw new Error(`Gagal menyelesaikan laporan pelayanan: ${JSON.stringify(dataSelesaikanPelayanan)}`);
    }

    const updatedLaporan2 = await prisma.laporan.findUnique({ where: { id: laporanPelayanan.id } });
    console.log('✅ Status DB:', updatedLaporan2?.status);
    console.log('✅ Catatan Selesai:', updatedLaporan2?.catatanSelesai);
    console.log('✅ Foto Selesai:', updatedLaporan2?.fotoSelesai, '(null seperti yang diharapkan)');
    console.log('✅ Waktu Selesai:', updatedLaporan2?.selesaiAt?.toISOString());

    if (updatedLaporan2?.fotoSelesai !== null) {
      throw new Error('fotoSelesai laporan pelayanan tanpa foto harus bernilai null');
    }

    // ------------------------------------------------------------------------------------
    // SKENARIO 5: Integritas Status Laporan Selesai
    // ------------------------------------------------------------------------------------
    console.log('\n--- 6. Pengujian: Proteksi Laporan yang Sudah Selesai ---');

    // Coba selesaikan ulang laporan yang sudah berstatus SELESAI
    const resReselesai = await fetch(`${baseUrl}/api/admin/laporan/${laporanPelayanan.id}/selesai`, {
      method: 'POST',
      headers: {
        Cookie: `token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        catatanSelesai: 'Mencoba selesaikan ulang laporan selesai.',
      }),
    });
    console.log(`[POST /selesai ulang pada laporan selesai] Status: ${resReselesai.status} (Diharapkan 409 Conflict)`);
    if (resReselesai.status !== 409) throw new Error('Harusnya ditolak 409 Conflict');

    // Coba PATCH status laporan yang sudah berstatus SELESAI
    const resPatchFinished = await fetch(`${baseUrl}/api/admin/laporan`, {
      method: 'PATCH',
      headers: {
        Cookie: `token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: laporanPelayanan.id,
        status: 'PROSES',
      }),
    });
    console.log(`[PATCH status pada laporan selesai] Status: ${resPatchFinished.status} (Diharapkan 409 Conflict)`);
    if (resPatchFinished.status !== 409) throw new Error('Harusnya ditolak 409 Conflict saat modifikasi laporan selesai');

    console.log('\n====================================================');
    console.log('🎉 SELURUH SKENARIO SMOKE TEST FASE 21 BERHASIL 100%!');
    console.log('====================================================');
  } finally {
    // Cleanup test data
    console.log('\n--- Membersihkan Data Uji Smoke Test ---');
    if (createdLaporanIds.length > 0) {
      await prisma.laporan.deleteMany({
        where: { id: { in: createdLaporanIds } },
      });
      console.log(`🧹 Dihapus ${createdLaporanIds.length} laporan uji dari database.`);
    }

    // Clean up sample image files
    if (fs.existsSync(fotoAwalPath)) {
      fs.unlinkSync(fotoAwalPath);
    }
    for (const file of uploadedProofFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    console.log('🧹 Berkas gambar uji telah dibersihkan.');

    // Hapus akun uji yang dibuat skrip ini (hanya yang berakhiran .smoke@sipmas.go.id dan dibuat oleh skrip)
    if (createdSmokeUserIds.length > 0) {
      const deletedUsers = await prisma.user.deleteMany({
        where: {
          id: { in: createdSmokeUserIds },
          email: { endsWith: '.smoke@sipmas.go.id' },
        },
      });
      console.log(`🧹 Dihapus ${deletedUsers.count} akun uji .smoke@sipmas.go.id yang dibuat oleh skrip.`);
    }

    server.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ Smoke Test Gagal:', err);
  process.exit(1);
});
