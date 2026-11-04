import prisma from '../src/lib/prisma';
import { Prisma } from '@prisma/client';
import { normalizeCategory } from '../src/modules/admin/admin.controller';

// --- IMPLEMENTASI LAMA (Fase 15 / sebelum 16.7) ---
async function oldAnalytics(range: string, categoryFilter: string) {
  let semuaLaporan = await prisma.laporan.findMany({
    select: {
      id: true,
      status: true,
      kategori: true,
      lokasi: true,
      tanggalKejadian: true,
      kategoriPrediksi: true,
      confidenceScore: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const oldNormalizeCategory = (cat: string | null, predCat: string | null) => {
    const target = (cat || predCat || '').toLowerCase();
    if (target.includes('infrastruktur')) return 'Infrastruktur';
    if (target.includes('lingkungan')) return 'Lingkungan';
    if (target.includes('pelayanan')) return 'Pelayanan';
    return 'Lainnya';
  };

  const now = new Date();
  if (range !== 'SEMUA') {
    semuaLaporan = semuaLaporan.filter((l) => {
      const reportDate = new Date(l.tanggalKejadian || l.createdAt);
      const diffMs = now.getTime() - reportDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (range === 'HARI_INI') {
        return diffDays <= 1;
      } else if (range === 'MINGGU_INI') {
        return diffDays <= 7;
      } else if (range === 'BULAN_INI') {
        return diffDays <= 30;
      }
      return true;
    });
  }

  if (categoryFilter !== 'SEMUA') {
    semuaLaporan = semuaLaporan.filter((l) => {
      const cat = oldNormalizeCategory(l.kategori, l.kategoriPrediksi);
      return cat.toUpperCase() === categoryFilter.toUpperCase();
    });
  }

  const totalLaporan = semuaLaporan.length;
  const laporanAktif = semuaLaporan.filter(
    (l) => l.status === 'PENDING' || l.status === 'PROSES'
  ).length;
  const laporanSelesai = semuaLaporan.filter((l) => l.status === 'SELESAI').length;

  const kategoriCount: Record<string, number> = {
    Infrastruktur: 0,
    Lingkungan: 0,
    Pelayanan: 0,
    Lainnya: 0,
  };

  const hotspotCount: Record<string, number> = {};
  const validConfidenceScores: number[] = [];

  semuaLaporan.forEach((laporan) => {
    const cat = oldNormalizeCategory(laporan.kategori, laporan.kategoriPrediksi);
    kategoriCount[cat] = (kategoriCount[cat] || 0) + 1;

    const rawLoc = (laporan.lokasi || '').trim();
    if (rawLoc && rawLoc.toLowerCase() !== 'tidak diketahui') {
      const locName = rawLoc
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      hotspotCount[locName] = (hotspotCount[locName] || 0) + 1;
    }

    if (typeof laporan.confidenceScore === 'number' && !isNaN(laporan.confidenceScore)) {
      validConfidenceScores.push(laporan.confidenceScore);
    }
  });

  const kategoriStats = Object.keys(kategoriCount)
    .map((key) => {
      const count = kategoriCount[key];
      const percentage = totalLaporan === 0 ? 0 : Math.round((count / totalLaporan) * 100);
      return {
        name: key,
        pct: `${percentage}%`,
        rawPct: percentage,
        light: key === 'Lainnya',
      };
    })
    .sort((a, b) => b.rawPct - a.rawPct);

  const finalHotspots = Object.keys(hotspotCount)
    .map((locName) => ({
      name: locName,
      city: 'Wilayah Aduan',
      count: hotspotCount[locName] || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((h, idx) => ({
      rank: (idx + 1).toString(),
      name: h.name,
      city: h.city,
      count: h.count,
    }));

  const selesaiLaporan = semuaLaporan.filter((l) => l.status === 'SELESAI');
  let avgResolution: number | null = null;
  if (selesaiLaporan.length > 0) {
    const totalDiffMs = selesaiLaporan.reduce((acc, curr) => {
      const diff = new Date(curr.updatedAt).getTime() - new Date(curr.createdAt).getTime();
      return acc + (diff > 0 ? diff : 0);
    }, 0);
    const avgMs = totalDiffMs / selesaiLaporan.length;
    avgResolution = Math.round((avgMs / (1000 * 60 * 60)) * 10) / 10;
  }

  let avgConfidence: number | null = null;
  if (validConfidenceScores.length > 0) {
    const sum = validConfidenceScores.reduce((a, b) => a + b, 0);
    const avg = (sum / validConfidenceScores.length) * 100;
    avgConfidence = Math.round(avg * 10) / 10;
  }

  return {
    total: totalLaporan,
    aktif: laporanAktif,
    selesai: laporanSelesai,
    kategoriStats,
    hotspots: finalHotspots,
    avgResolution,
    avgConfidence,
  };
}

// --- IMPLEMENTASI BARU (Fase 16.7: groupBy, aggregate, $queryRaw) ---
async function newAnalytics(range: string, categoryFilter: string) {
  const now = new Date();
  const whereConditions: Prisma.LaporanWhereInput[] = [];

  if (range === 'HARI_INI' || range === 'MINGGU_INI' || range === 'BULAN_INI') {
    const days = range === 'HARI_INI' ? 1 : range === 'MINGGU_INI' ? 7 : 30;
    const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    whereConditions.push({
      OR: [
        {
          AND: [
            { tanggalKejadian: { not: null } },
            { tanggalKejadian: { gte: threshold } },
          ],
        },
        {
          AND: [
            { tanggalKejadian: null },
            { createdAt: { gte: threshold } },
          ],
        },
      ],
    });
  }

  if (categoryFilter && categoryFilter !== 'SEMUA') {
    const upper = categoryFilter.toUpperCase();
    if (upper === 'INFRASTRUKTUR') {
      whereConditions.push({
        OR: [
          { kategori: { contains: 'infrastruktur' } },
          {
            AND: [
              { OR: [{ kategori: null }, { kategori: '' }] },
              { kategoriPrediksi: { contains: 'infrastruktur' } },
            ],
          },
        ],
      });
    } else if (upper === 'LINGKUNGAN') {
      whereConditions.push({
        OR: [
          { kategori: { contains: 'lingkungan' } },
          {
            AND: [
              { OR: [{ kategori: null }, { kategori: '' }] },
              { kategoriPrediksi: { contains: 'lingkungan' } },
            ],
          },
        ],
      });
    } else if (upper === 'PELAYANAN') {
      whereConditions.push({
        OR: [
          { kategori: { contains: 'pelayanan' } },
          {
            AND: [
              { OR: [{ kategori: null }, { kategori: '' }] },
              { kategoriPrediksi: { contains: 'pelayanan' } },
            ],
          },
        ],
      });
    } else if (upper === 'LAINNYA') {
      whereConditions.push({
        AND: [
          {
            AND: [
              { NOT: { kategori: { contains: 'infrastruktur' } } },
              { NOT: { kategori: { contains: 'lingkungan' } } },
              { NOT: { kategori: { contains: 'pelayanan' } } },
            ],
          },
          {
            OR: [
              { AND: [{ kategori: { not: null } }, { NOT: { kategori: '' } }] },
              {
                AND: [
                  { NOT: { kategoriPrediksi: { contains: 'infrastruktur' } } },
                  { NOT: { kategoriPrediksi: { contains: 'lingkungan' } } },
                  { NOT: { kategoriPrediksi: { contains: 'pelayanan' } } },
                ],
              },
            ],
          },
        ],
      });
    }
  }

  const whereClause: Prisma.LaporanWhereInput = whereConditions.length > 0 ? { AND: whereConditions } : {};

  const groups = await prisma.laporan.groupBy({
    by: ['status', 'kategori', 'kategoriPrediksi', 'lokasi'],
    where: whereClause,
    _count: {
      _all: true,
    },
  });

  let totalLaporan = 0;
  let laporanAktif = 0;
  let laporanSelesai = 0;

  const kategoriCount: Record<string, number> = {
    Infrastruktur: 0,
    Lingkungan: 0,
    Pelayanan: 0,
    Lainnya: 0,
  };

  const hotspotCount: Record<string, number> = {};

  for (const group of groups) {
    const count = group._count._all;
    totalLaporan += count;

    if (group.status === 'PENDING' || group.status === 'PROSES') {
      laporanAktif += count;
    } else if (group.status === 'SELESAI') {
      laporanSelesai += count;
    }

    const cat = normalizeCategory(group.kategori, group.kategoriPrediksi);
    kategoriCount[cat] = (kategoriCount[cat] || 0) + count;

    const rawLoc = (group.lokasi || '').trim();
    if (rawLoc && rawLoc.toLowerCase() !== 'tidak diketahui') {
      const locName = rawLoc
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      hotspotCount[locName] = (hotspotCount[locName] || 0) + count;
    }
  }

  const kategoriStats = Object.keys(kategoriCount)
    .map((key) => {
      const count = kategoriCount[key];
      const percentage = totalLaporan === 0 ? 0 : Math.round((count / totalLaporan) * 100);
      return {
        name: key,
        pct: `${percentage}%`,
        rawPct: percentage,
        light: key === 'Lainnya',
      };
    })
    .sort((a, b) => b.rawPct - a.rawPct);

  const finalHotspots = Object.keys(hotspotCount)
    .map((locName) => ({
      name: locName,
      city: 'Wilayah Aduan',
      count: hotspotCount[locName] || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((h, idx) => ({
      rank: (idx + 1).toString(),
      name: h.name,
      city: h.city,
      count: h.count,
    }));

  const aggConfidence = await prisma.laporan.aggregate({
    where: {
      ...whereClause,
      confidenceScore: { not: null },
    },
    _avg: {
      confidenceScore: true,
    },
  });

  let avgConfidence: number | null = null;
  if (aggConfidence._avg.confidenceScore !== null && aggConfidence._avg.confidenceScore !== undefined) {
    const avg = aggConfidence._avg.confidenceScore * 100;
    avgConfidence = Math.round(avg * 10) / 10;
  }

  const sqlConditions: Prisma.Sql[] = [Prisma.sql`status = 'SELESAI'`];
  if (range === 'HARI_INI' || range === 'MINGGU_INI' || range === 'BULAN_INI') {
    const days = range === 'HARI_INI' ? 1 : range === 'MINGGU_INI' ? 7 : 30;
    const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    sqlConditions.push(
      Prisma.sql`((tanggalKejadian IS NOT NULL AND tanggalKejadian >= ${threshold}) OR (tanggalKejadian IS NULL AND createdAt >= ${threshold}))`
    );
  }

  if (categoryFilter && categoryFilter !== 'SEMUA') {
    const catUpper = categoryFilter.toUpperCase();
    if (catUpper === 'INFRASTRUKTUR') {
      sqlConditions.push(
        Prisma.sql`(LOWER(COALESCE(kategori, '')) LIKE '%infrastruktur%' OR ((kategori IS NULL OR kategori = '') AND LOWER(COALESCE(kategoriPrediksi, '')) LIKE '%infrastruktur%'))`
      );
    } else if (catUpper === 'LINGKUNGAN') {
      sqlConditions.push(
        Prisma.sql`(LOWER(COALESCE(kategori, '')) LIKE '%lingkungan%' OR ((kategori IS NULL OR kategori = '') AND LOWER(COALESCE(kategoriPrediksi, '')) LIKE '%lingkungan%'))`
      );
    } else if (catUpper === 'PELAYANAN') {
      sqlConditions.push(
        Prisma.sql`(LOWER(COALESCE(kategori, '')) LIKE '%pelayanan%' OR ((kategori IS NULL OR kategori = '') AND LOWER(COALESCE(kategoriPrediksi, '')) LIKE '%pelayanan%'))`
      );
    } else if (catUpper === 'LAINNYA') {
      sqlConditions.push(
        Prisma.sql`(
          (LOWER(COALESCE(kategori, '')) NOT LIKE '%infrastruktur%' AND LOWER(COALESCE(kategori, '')) NOT LIKE '%lingkungan%' AND LOWER(COALESCE(kategori, '')) NOT LIKE '%pelayanan%')
          AND
          ((kategori IS NOT NULL AND kategori != '') OR (LOWER(COALESCE(kategoriPrediksi, '')) NOT LIKE '%infrastruktur%' AND LOWER(COALESCE(kategoriPrediksi, '')) NOT LIKE '%lingkungan%' AND LOWER(COALESCE(kategoriPrediksi, '')) NOT LIKE '%pelayanan%'))
        )`
      );
    }
  }

  let avgResolution: number | null = null;
  const queryRes = await prisma.$queryRaw<Array<{ avgHours: number | null }>>`
    SELECT AVG(GREATEST(0, TIMESTAMPDIFF(MICROSECOND, createdAt, updatedAt) / 1000.0)) / (1000 * 60 * 60) AS avgHours
    FROM Laporan
    WHERE ${Prisma.join(sqlConditions, ' AND ')}
  `;

  if (queryRes && queryRes[0] && queryRes[0].avgHours !== null && queryRes[0].avgHours !== undefined) {
    avgResolution = Math.round(Number(queryRes[0].avgHours) * 10) / 10;
  }

  return {
    total: totalLaporan,
    aktif: laporanAktif,
    selesai: laporanSelesai,
    kategoriStats,
    hotspots: finalHotspots,
    avgResolution,
    avgConfidence,
  };
}

async function runEquivalenceTests() {
  console.log('=== UJI KESETARAAN ANALYTICS: FUNGSI LAMA VS FUNGSI BARU ===\n');

  const testCases = [
    { range: 'SEMUA', category: 'SEMUA' },
    { range: 'HARI_INI', category: 'SEMUA' },
    { range: 'MINGGU_INI', category: 'SEMUA' },
    { range: 'BULAN_INI', category: 'SEMUA' },
    { range: 'SEMUA', category: 'INFRASTRUKTUR' },
    { range: 'SEMUA', category: 'PELAYANAN' },
    { range: 'SEMUA', category: 'LINGKUNGAN' },
    { range: 'SEMUA', category: 'LAINNYA' },
  ];

  let allMatched = true;

  for (const tc of testCases) {
    const oldRes = await oldAnalytics(tc.range, tc.category);
    const newRes = await newAnalytics(tc.range, tc.category);

    const oldStr = JSON.stringify(oldRes);
    const newStr = JSON.stringify(newRes);
    const isMatch = oldStr === newStr;

    console.log(`Kasus: range="${tc.range}", category="${tc.category}"`);
    console.log(`- Old output: ${oldStr}`);
    console.log(`- New output: ${newStr}`);
    console.log(`- Hasil: ${isMatch ? 'IDENTIK (100% MATCH)' : 'BEDA!'}\n`);

    if (!isMatch) {
      allMatched = false;
    }
  }

  if (allMatched) {
    console.log('HASIL AKHIR: SEMUA KASUS UJI MENGHASILKAN NILAI YANG 100% SAMA!');
  } else {
    console.error('HASIL AKHIR: ADA PERBEDAAN DALAM KASUS UJI!');
    process.exit(1);
  }

  await prisma.$disconnect();
}

runEquivalenceTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
