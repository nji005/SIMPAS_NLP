/**
 * infra/loadtest/skenario.js
 * Skenario pengujian beban k6 untuk SIPMAS.
 * Mensimulasikan perilaku pengguna nyata: login, buka riwayat, buka detail, dan kirim laporan (NLP).
 * 
 * Dijalankan tanpa instalasi via Docker:
 *   docker run --rm -v "${PWD}/infra/loadtest:/scripts" -e BASE_URL=http://host.docker.internal:5001 -e LOADTEST_PASSWORD="SandiUji123!" grafana/k6 run /scripts/skenario.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ==========================================
// 1. VALIDASI ATURAN KERAS (STRICT GUARDS)
// ==========================================
const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:5001';
const allowedHosts = ['localhost', '127.0.0.1', 'host.docker.internal'];
let isHostAllowed = false;
for (const h of allowedHosts) {
  if (BASE_URL.includes(h)) {
    isHostAllowed = true;
    break;
  }
}

if (!isHostAllowed) {
  throw new Error(`❌ DITOLAK: BASE_URL (${BASE_URL}) tidak diizinkan! Uji beban HANYA boleh berjalan pada localhost, 127.0.0.1, atau host.docker.internal.`);
}

if (__ENV.NODE_ENV === 'production') {
  throw new Error('❌ DITOLAK: Dilarang menjalankan uji beban pada lingkungan produksi (NODE_ENV=production)!');
}

const LOADTEST_PASSWORD = __ENV.LOADTEST_PASSWORD;
if (!LOADTEST_PASSWORD || LOADTEST_PASSWORD.trim() === '') {
  throw new Error('❌ DITOLAK: Variabel lingkungan LOADTEST_PASSWORD wajib disertakan (contoh: -e LOADTEST_PASSWORD="SandiUji123!").');
}

// ==========================================
// 2. METRIK KUSTOM & THRESHOLDS
// ==========================================
const readDuration = new Trend('read_duration', true);
const laporanDuration = new Trend('laporan_duration', true);
const loginDuration = new Trend('login_duration', true);
const errorRate = new Rate('custom_error_rate');
const laporanCreatedCounter = new Counter('laporan_created_count');

// Durasi tahapan: default 2 menit per tahap sesuai instruksi, dapat di-override untuk pengujian cepat
const STAGE_DURATION = __ENV.STAGE_DURATION || '2m';
const RAMP_DOWN_DURATION = __ENV.RAMP_DOWN_DURATION || '30s';

// Konversi string durasi (mis. "2m", "30s", "10s") ke milidetik
function parseDurationMs(durStr) {
  if (!durStr) return 120000;
  const match = durStr.trim().match(/^([0-9.]+)\s*([a-zA-Z]+)$/);
  if (!match) return 120000;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm' || unit === 'min') return val * 60 * 1000;
  if (unit === 's' || unit === 'sec') return val * 1000;
  return val;
}

const stageMs = parseDurationMs(STAGE_DURATION);

export const options = {
  stages: [
    { target: 5, duration: STAGE_DURATION },     // Tahap 1: 5 VU (~2m)
    { target: 15, duration: STAGE_DURATION },    // Tahap 2: 15 VU (~2m)
    { target: 30, duration: STAGE_DURATION },    // Tahap 3: 30 VU (~2m)
    { target: 50, duration: STAGE_DURATION },    // Tahap 4: 50 VU (~2m)
    { target: 0, duration: RAMP_DOWN_DURATION }, // Ramp down (turun kembali)
  ],
  thresholds: {
    // p95 respons baca < 800 ms
    read_duration: ['p(95)<800'],
    // p95 kirim laporan < 3000 ms (3 detik)
    laporan_duration: ['p(95)<3000'],
    // tingkat error total < 1 persen
    http_req_failed: ['rate<0.01'],
    custom_error_rate: ['rate<0.01'],
  },
};

// Inisialisasi awal sekali (setup) untuk mencatat waktu mulai pengujian secara akurat
export function setup() {
  return {
    startTime: Date.now(),
  };
}

// Helper jeda acak 1 sampai 4 detik antar aksi pengguna
function randomSleep(min = 1, max = 4) {
  sleep(min + Math.random() * (max - min));
}

// State sesi per virtual user (k6 mengeksekusi ini terisolasi per VU)
let hasLoggedIn = false;
let sessionCookie = '';
let userEmail = '';
let userIp = '';

export default function (setupData) {
  // Hitung stage aktif berdasarkan waktu berjalan dari setup
  const elapsedMs = setupData && setupData.startTime ? (Date.now() - setupData.startTime) : 0;
  let stageName = 'stage_5';
  if (elapsedMs < 1 * stageMs) {
    stageName = 'stage_5';
  } else if (elapsedMs < 2 * stageMs) {
    stageName = 'stage_15';
  } else if (elapsedMs < 3 * stageMs) {
    stageName = 'stage_30';
  } else if (elapsedMs < 4 * stageMs) {
    stageName = 'stage_50';
  } else {
    stageName = 'ramp_down';
  }

  // Mapping VU ke akun uji (1 s/d 60)
  const userIndex = ((__VU - 1) % 60) + 1;
  userEmail = `loadtest-${userIndex}@example.test`;
  userIp = `10.0.0.${userIndex}`;

  const baseHeaders = {
    'X-Forwarded-For': userIp,
    'User-Agent': `k6-SIPMAS-LoadTest/1.0 (VU-${__VU})`,
  };

  // -------------------------------------------------------------
  // LANGKAH 1: Login Pengguna
  // Pengguna asli login sekali saat memulai sesi browser, lalu
  // menggunakan cookie sesi httpOnly untuk seluruh aksi berikutnya.
  // -------------------------------------------------------------
  if (!hasLoggedIn || !sessionCookie) {
    const loginPayload = JSON.stringify({
      email: userEmail,
      password: LOADTEST_PASSWORD,
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
      headers: Object.assign({}, baseHeaders, { 'Content-Type': 'application/json' }),
      tags: { action: 'login', stage: stageName },
    });

    loginDuration.add(loginRes.timings.duration, { stage: stageName });
    const loginOk = check(loginRes, {
      'login status 200': (r) => r.status === 200,
    });

    if (loginOk) {
      hasLoggedIn = true;
      const rawCookie = loginRes.headers['Set-Cookie'] || (loginRes.cookies && loginRes.cookies.token && loginRes.cookies.token[0] ? `token=${loginRes.cookies.token[0].value}` : '');
      if (rawCookie) {
        sessionCookie = rawCookie.split(';')[0];
      }
    } else {
      errorRate.add(1, { stage: stageName });
      randomSleep(2, 4);
      return;
    }

    randomSleep(1, 4);
  }

  // Header terautentikasi dengan cookie sesi
  const authHeaders = Object.assign({}, baseHeaders, {
    Cookie: sessionCookie,
  });

  // -------------------------------------------------------------
  // LANGKAH 2: Buka Daftar Riwayat Laporan (GET /api/riwayat)
  // -------------------------------------------------------------
  const riwayatRes = http.get(`${BASE_URL}/api/riwayat`, {
    headers: authHeaders,
    tags: { action: 'read_riwayat', stage: stageName },
  });

  readDuration.add(riwayatRes.timings.duration, { stage: stageName });
  const riwayatOk = check(riwayatRes, {
    'riwayat status 200': (r) => r.status === 200,
  });

  if (!riwayatOk) {
    errorRate.add(1, { stage: stageName });
    if (riwayatRes.status === 401) {
      hasLoggedIn = false;
    }
  }

  // Ambil ID laporan yang ada untuk dibuka rinciannya
  let reportId = null;
  try {
    const list = riwayatRes.json();
    if (Array.isArray(list) && list.length > 0) {
      const randomIndex = Math.floor(Math.random() * list.length);
      reportId = list[randomIndex].id;
    }
  } catch (e) {
    // Abaikan kegagalan parsing
  }

  randomSleep(1, 4);

  // -------------------------------------------------------------
  // LANGKAH 3: Buka Detail Satu Laporan (GET /api/riwayat/:id)
  // -------------------------------------------------------------
  if (reportId) {
    const detailRes = http.get(`${BASE_URL}/api/riwayat/${reportId}`, {
      headers: authHeaders,
      tags: { action: 'read_detail', stage: stageName },
    });

    readDuration.add(detailRes.timings.duration, { stage: stageName });
    const detailOk = check(detailRes, {
      'detail status 200': (r) => r.status === 200,
    });

    if (!detailOk) {
      errorRate.add(1, { stage: stageName });
    }

    randomSleep(1, 4);
  }

  // -------------------------------------------------------------
  // LANGKAH 4: Kadang Kirim Laporan Baru (NLP dipanggil)
  // Dilakukan jarang (sekitar 1 dari 8 iterasi = 12.5%) dan tanpa foto
  // agar tidak memenuhi ruang disk selama uji beban berjalan.
  // -------------------------------------------------------------
  const shouldCreateLaporan = Math.random() < 0.125; // 1 dari 8 iterasi

  if (shouldCreateLaporan) {
    const laporanPayload = JSON.stringify({
      judul: `Keluhan Jalan Berlubang VU ${__VU} #${__ITER}`,
      isi: 'Mohon dinas terkait segera menambal aspal jalan raya yang berlubang besar dan retak karena sangat membahayakan pengendara roda dua.',
      kategori: 'Infrastruktur',
      lokasi: `Kecamatan Uji ${((userIndex - 1) % 8) + 1}`,
      tanggal: '2026-11-10',
    });

    const createRes = http.post(`${BASE_URL}/api/laporan`, laporanPayload, {
      headers: Object.assign({}, authHeaders, { 'Content-Type': 'application/json' }),
      tags: { action: 'create_laporan_nlp', stage: stageName },
    });

    laporanDuration.add(createRes.timings.duration, { stage: stageName });
    const createOk = check(createRes, {
      'laporan status 201': (r) => r.status === 201,
    });

    if (createOk) {
      laporanCreatedCounter.add(1, { stage: stageName });
    } else {
      errorRate.add(1, { stage: stageName });
    }

    randomSleep(1, 4);
  }
}

// Menghasilkan ringkasan JSON dan cetakan tabel ringkas di akhir pengujian
export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    '/scripts/summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const readP95 = data.metrics.read_duration ? data.metrics.read_duration.values['p(95)'].toFixed(2) : 'N/A';
  const readAvg = data.metrics.read_duration ? data.metrics.read_duration.values.avg.toFixed(2) : 'N/A';
  const laporanP95 = data.metrics.laporan_duration ? data.metrics.laporan_duration.values['p(95)'].toFixed(2) : 'N/A';
  const laporanAvg = data.metrics.laporan_duration ? data.metrics.laporan_duration.values.avg.toFixed(2) : 'N/A';
  const errRate = data.metrics.http_req_failed ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) : '0';
  const totalReq = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const reqPerSec = data.metrics.http_reqs ? data.metrics.http_reqs.values.rate.toFixed(2) : '0';
  const laporanCount = data.metrics.laporan_created_count ? data.metrics.laporan_created_count.values.count : 0;

  function getSubMetric(metricName, stage, field) {
    const key = `${metricName}{stage:${stage}}`;
    if (data.metrics[key] && data.metrics[key].values && data.metrics[key].values[field] !== undefined) {
      return data.metrics[key].values[field];
    }
    return null;
  }

  const stagesList = [
    { name: '5 Pengguna', tag: 'stage_5' },
    { name: '15 Pengguna', tag: 'stage_15' },
    { name: '30 Pengguna', tag: 'stage_30' },
    { name: '50 Pengguna', tag: 'stage_50' },
  ];

  let stageTable = 'Tahap              | Req Total | Throughput (req/s) | p50 Respons (ms) | p95 Respons (ms) | Error (%)\n';
  stageTable +=    '-------------------|-----------|--------------------|------------------|------------------|----------\n';

  for (const s of stagesList) {
    const count = getSubMetric('http_reqs', s.tag, 'count') || 0;
    const rate = getSubMetric('http_reqs', s.tag, 'rate') || 0;
    const p50 = getSubMetric('http_req_duration', s.tag, 'med') || 0;
    const p95 = getSubMetric('http_req_duration', s.tag, 'p(95)') || 0;
    const err = getSubMetric('http_req_failed', s.tag, 'rate') || 0;

    stageTable += `${s.name.padEnd(18, ' ')} | ${String(count).padStart(9, ' ')} | ${rate.toFixed(2).padStart(18, ' ')} | ${p50.toFixed(2).padStart(16, ' ')} | ${p95.toFixed(2).padStart(16, ' ')} | ${(err * 100).toFixed(2).padStart(8, ' ')}%\n`;
  }

  return `
========================================================================
             RINGKASAN HASIL PENGUJIAN BEBAN SIPMAS (k6)
========================================================================
Total Permintaan HTTP : ${totalReq}
Throughput Rata-rata  : ${reqPerSec} req/detik
Tingkat Error (gagal) : ${errRate}% (Ambang batas: < 1.00%)
Laporan dibuat (NLP)  : ${laporanCount}

Waktu Respons Baca (Riwayat & Detail):
 - Rata-rata : ${readAvg} ms
 - p95       : ${readP95} ms (Ambang batas: < 800 ms)

Waktu Respons Kirim Laporan (NLP Service):
 - Rata-rata : ${laporanAvg} ms
 - p95       : ${laporanP95} ms (Ambang batas: < 3000 ms)

Rincian Metrik per Tahap Beban:
${stageTable}
========================================================================
`;
}

