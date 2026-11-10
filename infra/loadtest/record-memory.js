/**
 * infra/loadtest/record-memory.js
 * Skrip pencatat penggunaan memori dan CPU kontainer Docker tiap 5 detik ke berkas CSV.
 * 
 * Penggunaan:
 *   node infra/loadtest/record-memory.js [output.csv] [--duration <detik>]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV === 'production') {
  console.error('❌ DITOLAK: Uji beban tidak boleh dijalankan di lingkungan produksi!');
  process.exit(1);
}

// Konfigurasi file output
const defaultCsvPath = path.resolve(__dirname, 'memory-stats.csv');
const args = process.argv.slice(2);
let outputFile = defaultCsvPath;
let maxDurationSec = 0; // 0 = tak terbatas sampai SIGINT/SIGTERM

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--duration' && args[i + 1]) {
    maxDurationSec = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith('--')) {
    outputFile = path.resolve(process.cwd(), args[i]);
  }
}

// Helper untuk mengonversi string ukuran memori (mis. "120.5MiB", "1.2GiB", "800KiB") ke MiB angka
function parseMemoryToMiB(raw) {
  if (!raw) return 0;
  const cleaned = raw.trim();
  const match = cleaned.match(/^([0-9.]+)\s*([a-zA-Z]+)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('gib') || unit === 'gb') return val * 1024;
  if (unit.startsWith('mib') || unit === 'mb') return val;
  if (unit.startsWith('kib') || unit === 'kb') return val / 1024;
  if (unit.startsWith('b')) return val / (1024 * 1024);
  return val;
}

// Tulis header CSV jika berkas belum ada atau baru dibuat
const csvHeader = [
  'timestamp',
  'elapsed_sec',
  'mysql_mem_mib',
  'mysql_mem_perc',
  'mysql_cpu_perc',
  'nlp_mem_mib',
  'nlp_mem_perc',
  'nlp_cpu_perc',
  'backend_mem_mib',
  'backend_mem_perc',
  'backend_cpu_perc',
  'frontend_mem_mib',
  'frontend_mem_perc',
  'frontend_cpu_perc',
  'total_mem_mib',
].join(',') + '\n';

fs.writeFileSync(outputFile, csvHeader, { encoding: 'utf8' });

console.log('=== PENCATAT MEMORI KONTAINER DOCKER (INTERVAL 5 DETIK) ===');
console.log(`Menulis catatan ke: ${outputFile}`);
if (maxDurationSec > 0) {
  console.log(`Durasi otomatis: ${maxDurationSec} detik`);
}
console.log('Tekan Ctrl+C untuk menghentikan pencatatan kapan saja.\n');

const startTime = Date.now();
const peaks = {
  mysql: { mem: 0, cpu: 0 },
  nlp: { mem: 0, cpu: 0 },
  backend: { mem: 0, cpu: 0 },
  frontend: { mem: 0, cpu: 0 },
  total: { mem: 0 },
};

let isRunning = true;

function collectStats() {
  if (!isRunning) return;

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  const nowIso = new Date().toISOString();

  try {
    const rawOutput = execSync(
      'docker stats --no-stream --format "{{.Name}}\\t{{.MemUsage}}\\t{{.MemPerc}}\\t{{.CPUPerc}}"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );

    const lines = rawOutput.trim().split('\n');
    const stats = {
      mysql: { mem: 0, memPerc: '0%', cpuPerc: '0%' },
      nlp: { mem: 0, memPerc: '0%', cpuPerc: '0%' },
      backend: { mem: 0, memPerc: '0%', cpuPerc: '0%' },
      frontend: { mem: 0, memPerc: '0%', cpuPerc: '0%' },
    };

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 4) continue;
      const name = parts[0].trim();
      const memUsage = parts[1].split('/')[0].trim();
      const memPerc = parts[2].trim();
      const cpuPerc = parts[3].trim();
      const memMiB = parseMemoryToMiB(memUsage);
      const cpuVal = parseFloat(cpuPerc.replace('%', '')) || 0;

      let key = null;
      if (name.includes('mysql')) key = 'mysql';
      else if (name.includes('nlp')) key = 'nlp';
      else if (name.includes('backend')) key = 'backend';
      else if (name.includes('frontend')) key = 'frontend';

      if (key) {
        stats[key] = { mem: memMiB, memPerc, cpuPerc };
        if (memMiB > peaks[key].mem) peaks[key].mem = memMiB;
        if (cpuVal > peaks[key].cpu) peaks[key].cpu = cpuVal;
      }
    }

    const totalMem =
      stats.mysql.mem + stats.nlp.mem + stats.backend.mem + stats.frontend.mem;
    if (totalMem > peaks.total.mem) peaks.total.mem = totalMem;

    const row = [
      nowIso,
      elapsedSec,
      stats.mysql.mem.toFixed(2),
      stats.mysql.memPerc,
      stats.mysql.cpuPerc,
      stats.nlp.mem.toFixed(2),
      stats.nlp.memPerc,
      stats.nlp.cpuPerc,
      stats.backend.mem.toFixed(2),
      stats.backend.memPerc,
      stats.backend.cpuPerc,
      stats.frontend.mem.toFixed(2),
      stats.frontend.memPerc,
      stats.frontend.cpuPerc,
      totalMem.toFixed(2),
    ].join(',') + '\n';

    fs.appendFileSync(outputFile, row, { encoding: 'utf8' });

    console.log(
      `[+${String(elapsedSec).padStart(3, ' ')}s] ` +
      `MySQL: ${stats.mysql.mem.toFixed(1)} MiB | ` +
      `NLP: ${stats.nlp.mem.toFixed(1)} MiB | ` +
      `Backend: ${stats.backend.mem.toFixed(1)} MiB | ` +
      `Frontend: ${stats.frontend.mem.toFixed(1)} MiB | ` +
      `TOTAL: ${totalMem.toFixed(1)} MiB`
    );

    if (maxDurationSec > 0 && elapsedSec >= maxDurationSec) {
      stopAndSummary();
    }
  } catch (err) {
    // Docker daemon transient busy or connecting
  }
}

function stopAndSummary() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(intervalId);

  console.log('\n=== RINGKASAN PENGGUNAAN MEMORI PUNCAK (PEAK) ===');
  console.log(` - MySQL Peak:    ${peaks.mysql.mem.toFixed(2)} MiB (CPU Peak: ${peaks.mysql.cpu.toFixed(1)}%)`);
  console.log(` - NLP Peak:      ${peaks.nlp.mem.toFixed(2)} MiB (CPU Peak: ${peaks.nlp.cpu.toFixed(1)}%)`);
  console.log(` - Backend Peak:  ${peaks.backend.mem.toFixed(2)} MiB (CPU Peak: ${peaks.backend.cpu.toFixed(1)}%)`);
  console.log(` - Frontend Peak: ${peaks.frontend.mem.toFixed(2)} MiB (CPU Peak: ${peaks.frontend.cpu.toFixed(1)}%)`);
  console.log(` - TOTAL Peak:    ${peaks.total.mem.toFixed(2)} MiB`);
  console.log(`Catatan tersimpan rapi di: ${outputFile}\n`);
  process.exit(0);
}

process.on('SIGINT', stopAndSummary);
process.on('SIGTERM', stopAndSummary);

// Eksekusi segera lalu tiap 5 detik
collectStats();
const intervalId = setInterval(collectStats, 5000);
