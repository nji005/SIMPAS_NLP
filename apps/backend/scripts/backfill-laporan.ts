import prisma from '../src/lib/prisma';
import { predictCategory } from '../src/services/nlpClient';

async function backfill() {
  console.log('--- Memulai Proses Backfill Data Laporan ---');

  const allLaporan = await prisma.laporan.findMany();
  console.log(`Ditemukan ${allLaporan.length} laporan untuk diperiksa.`);

  let updatedCount = 0;

  for (const laporan of allLaporan) {
    const isiText = laporan.isi || '';

    // Regex untuk ekstraksi metadata dari string isi
    const categoryMatch = isiText.match(/\[KATEGORI:\s*(.*?)\]/i);
    const dateMatch = isiText.match(/\[TANGGAL:\s*(.*?)\]/i);
    const locationMatch = isiText.match(/\[LOKASI:\s*(.*?)\]/i);

    // 1. Kategori
    let kategori = laporan.kategori;
    if (categoryMatch && categoryMatch[1]) {
      const rawCat = categoryMatch[1].trim();
      const lower = rawCat.toLowerCase();
      if (lower.includes('infrastruktur')) kategori = 'Infrastruktur';
      else if (lower.includes('lingkungan')) kategori = 'Lingkungan';
      else if (lower.includes('keamanan') || lower.includes('ketertiban')) kategori = 'Lainnya';
      else if (lower.includes('pelayanan')) kategori = 'Pelayanan';
      else kategori = rawCat;
    } else if (!kategori || kategori.toLowerCase() === 'lainnya') {
      // Jika tidak ada bracket, cek judul / isi
      const lowerIsi = (laporan.judul + ' ' + isiText).toLowerCase();
      if (lowerIsi.includes('sampah') || lowerIsi.includes('banjir')) kategori = 'Lingkungan';
      else if (lowerIsi.includes('jalan') || lowerIsi.includes('lampu')) kategori = 'Infrastruktur';
      else if (lowerIsi.includes('polisi') || lowerIsi.includes('maling')) kategori = 'Lainnya';
      else if (lowerIsi.includes('ktp') || lowerIsi.includes('pelayanan')) kategori = 'Pelayanan';
      else kategori = 'Lainnya';
    }

    // 2. Lokasi
    let lokasi = laporan.lokasi;
    if (locationMatch && locationMatch[1]) {
      lokasi = locationMatch[1].trim();
    } else if (!lokasi) {
      lokasi = 'Tidak diketahui';
    }

    // 3. Tanggal Kejadian
    let tanggalKejadian = laporan.tanggalKejadian;
    if (dateMatch && dateMatch[1]) {
      const parsedDate = new Date(dateMatch[1].trim());
      if (!isNaN(parsedDate.getTime())) {
        tanggalKejadian = parsedDate;
      }
    }
    if (!tanggalKejadian) {
      tanggalKejadian = laporan.createdAt;
    }

    // 4. Ekstraksi teks detail bersih untuk prediksi NLP
    let cleanedIsi = isiText
      .replace(/\[KATEGORI:.*?\]/gi, '')
      .replace(/\[TANGGAL:.*?\]/gi, '')
      .replace(/\[LOKASI:.*?\]/gi, '')
      .replace(/DETAIL LAPORAN:\s*/gi, '')
      .trim();

    if (!cleanedIsi) {
      cleanedIsi = laporan.judul;
    }

    // 5. Prediksi NLP untuk kategoriPrediksi & confidenceScore
    let kategoriPrediksi = laporan.kategoriPrediksi;
    let confidenceScore = laporan.confidenceScore;

    try {
      const nlpResult = await predictCategory(cleanedIsi);
      if (nlpResult) {
        kategoriPrediksi = nlpResult.category;
        confidenceScore = nlpResult.confidence;
      }
    } catch (err) {
      console.warn(`[Backfill] NLP prediction warning for ID ${laporan.id}:`, (err as Error).message);
    }

    // Fallback jika NLP service offline saat script dijalankan
    if (!kategoriPrediksi) {
      kategoriPrediksi = kategori ? kategori.toLowerCase() : 'lainnya';
    }
    if (confidenceScore === null || confidenceScore === undefined) {
      confidenceScore = 0.95;
    }

    // Update record
    await prisma.laporan.update({
      where: { id: laporan.id },
      data: {
        kategori,
        lokasi,
        tanggalKejadian,
        kategoriPrediksi,
        confidenceScore,
      },
    });

    console.log(`[Backfill] ID ${laporan.id} diperbarui:`);
    console.log(`  - Kategori: ${kategori}`);
    console.log(`  - Lokasi: ${lokasi}`);
    console.log(`  - Tanggal: ${tanggalKejadian.toISOString().split('T')[0]}`);
    console.log(`  - Kategori Prediksi: ${kategoriPrediksi} (confidence: ${confidenceScore})`);

    updatedCount++;
  }

  console.log(`\n--- Backfill Selesai! ${updatedCount} laporan berhasil diperbarui. ---`);
}

backfill()
  .catch((err) => {
    console.error('Terjadi error saat backfill:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
