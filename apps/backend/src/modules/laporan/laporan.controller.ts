import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { predictCategory } from '../../services/nlpClient';
import { storageService } from '../../services/storageService';
import { logger } from '../../lib/logger';

export async function createLaporan(req: Request, res: Response) {
  try {
    const { judul, isi, tanggal, lokasi, kategori } = req.body;
    const file = req.file;

    // Ambil userId dari token terverifikasi di server (req.user), bukan dari client!
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Anda harus login untuk melapor!" });
    }

    if (!judul || !isi) {
      return res.status(400).json({ message: "Judul dan isi laporan wajib diisi!" });
    }

    let fotoPath = null;
    if (file) {
      const uploadResult = await storageService.upload(file);
      fotoPath = uploadResult.url;
    }

    // Panggil nlp-service secara server-side untuk klasifikasi laporan
    let kategoriPrediksi: string | null = null;
    let confidenceScore: number | null = null;
    let isUncertain = false;

    try {
      const nlpResult = await predictCategory(isi);
      if (nlpResult) {
        kategoriPrediksi = nlpResult.category;
        confidenceScore = nlpResult.confidence;
        isUncertain = nlpResult.uncertain;
      } else {
        isUncertain = true;
      }
    } catch (nlpError) {
      isUncertain = true;
      logger.warn({ err: nlpError }, "[Laporan] Warning: NLP service call failed, continuing without prediction");
    }

    // Normalisasi kategori: bila null/uncertain -> kategori 'Lainnya',
    // kategoriPrediksi dan confidenceScore tetap disimpan bila ada.
    let finalKategori = "Lainnya";
    if (!isUncertain && kategoriPrediksi) {
      finalKategori = kategoriPrediksi.charAt(0).toUpperCase() + kategoriPrediksi.slice(1);
    } else if (kategori && kategori.toLowerCase() !== "lainnya" && !isUncertain) {
      finalKategori = kategori.charAt(0).toUpperCase() + kategori.slice(1);
    }

    const finalLokasi = lokasi || "Tidak diketahui";

    let parsedTanggalKejadian = new Date();
    if (tanggal) {
      const d = new Date(tanggal);
      if (!isNaN(d.getTime())) {
        parsedTanggalKejadian = d;
      }
    }

    const formattedTanggalStr = tanggal || parsedTanggalKejadian.toISOString().split('T')[0];
    const detailLaporan = `[KATEGORI: ${finalKategori}]\n[TANGGAL: ${formattedTanggalStr}]\n[LOKASI: ${finalLokasi}]\n\nDETAIL LAPORAN:\n${isi}`;

    const laporanBaru = await prisma.laporan.create({
      data: {
        judul: judul,
        isi: detailLaporan,
        kategori: finalKategori,
        lokasi: finalLokasi,
        tanggalKejadian: parsedTanggalKejadian,
        kategoriPrediksi: kategoriPrediksi,
        confidenceScore: confidenceScore,
        foto: fotoPath,
        userId: Number(userId),
      },
    });

    return res.status(201).json({ message: "Laporan berhasil dikirim!", laporan: laporanBaru });
  } catch (error) {
    logger.error({ err: error }, "ERROR POST LAPORAN:");
    return res.status(500).json({ message: "Terjadi kesalahan server saat menyimpan laporan." });
  }
}


