import { Request, Response } from 'express';
import prisma from '../../lib/prisma';

function getDatabaseNameFromUrl(url?: string): string {
  if (!url) return 'Tidak Diketahui';
  try {
    const u = new URL(url);
    const dbName = u.pathname.replace(/^\//, '');
    return dbName || 'Tidak Diketahui';
  } catch {
    const match = url.match(/\/([^/?]+)(?:\?|$)/);
    return match ? match[1] : 'Tidak Diketahui';
  }
}

export async function getSystemHealth() {
  // 1. Cek Koneksi Database MySQL (Query Dinamis SELECT DATABASE())
  const defaultDbName = getDatabaseNameFromUrl(process.env.DATABASE_URL);
  let dbStatus: {
    status: 'healthy' | 'down';
    latencyMs: number;
    name: string;
    error: string | null;
  } = {
    status: 'down',
    latencyMs: 0,
    name: defaultDbName,
    error: null,
  };
  try {
    const dbStart = Date.now();
    const queryResult = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT DATABASE() AS dbName`;
    const activeDbName =
      (queryResult?.[0]?.dbName as string) ||
      (queryResult?.[0]?.['DATABASE()'] as string) ||
      defaultDbName;

    dbStatus = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart,
      name: activeDbName,
      error: null,
    };
  } catch (err: any) {
    dbStatus = {
      status: 'down',
      latencyMs: 0,
      name: defaultDbName,
      error: err.message || 'Koneksi database terputus',
    };
  }

  // 2. Cek Koneksi Microservice NLP Python
  let nlpStatus: {
    status: 'healthy' | 'degraded' | 'down';
    latencyMs: number;
    details: any;
    error: string | null;
  } = {
    status: 'down',
    latencyMs: 0,
    details: null,
    error: null,
  };

  const nlpUrl = process.env.NLP_SERVICE_URL || 'http://127.0.0.1:5000';
  try {
    const nlpStart = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${nlpUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    const latency = Date.now() - nlpStart;
    if (res.ok) {
      const data = await res.json();
      nlpStatus = {
        status: 'healthy',
        latencyMs: latency,
        details: data,
        error: null,
      };
    } else {
      nlpStatus = {
        status: 'degraded',
        latencyMs: latency,
        details: null,
        error: `HTTP status ${res.status}`,
      };
    }
  } catch (err: any) {
    nlpStatus = {
      status: 'down',
      latencyMs: 0,
      details: null,
      error: err.name === 'AbortError' ? 'Timeout (lebih dari 3.5 detik)' : (err.message || 'Layanan NLP tidak merespons'),
    };
  }

  // 3. Metrik Internal Backend Node.js
  const uptimeSeconds = Math.floor(process.uptime());
  const memUsage = process.memoryUsage();
  const memRssMb = Math.round(memUsage.rss / (1024 * 1024));
  const memHeapMb = Math.round(memUsage.heapUsed / (1024 * 1024));

  const isHealthy = dbStatus.status === 'healthy';

  return {
    status: isHealthy ? 'OPERATIONAL' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptime: uptimeSeconds,
    memory: {
      rssMb: memRssMb,
      heapUsedMb: memHeapMb,
    },
    database: {
      ...dbStatus,
      url: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@') : 'Not Configured',
    },
    nlpService: {
      ...nlpStatus,
      url: nlpUrl,
    },
    mailService: {
      host: process.env.SMTP_HOST || 'mailhog',
      port: process.env.SMTP_PORT || '1025',
    },
    server: {
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5001,
    },
  };
}

// Handler API JSON: GET /api/status
export async function getStatusJson(_req: Request, res: Response) {
  const health = await getSystemHealth();
  const statusCode = health.status === 'OPERATIONAL' ? 200 : 503;
  return res.status(statusCode).json(health);
}

// Handler Layar Monitoring HTML (Black & White Theme seperti Localhost 3000): GET /
export async function getMonitoringHtml(_req: Request, res: Response) {
  const health = await getSystemHealth();

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}h`);
    if (h > 0) parts.push(`${h}m`);
    parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SIPMAS — Backend System Monitor</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #f8fafc;
      --bg-card: #ffffff;
      --bg-card-subtle: #f1f5f9;
      --border-light: #e2e8f0;
      --border-dark: #0f172a;
      --text-black: #0f172a;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      --black-btn: #000000;
      --black-btn-hover: #1e293b;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-base);
      color: var(--text-black);
      min-height: 100vh;
      padding: 2.5rem 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      width: 100%;
      max-width: 1120px;
    }

    /* Header Nav */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.5rem;
      margin-bottom: 2.25rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-light);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .brand-logo {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--black-btn);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1.25rem;
      color: #ffffff;
      letter-spacing: -0.02em;
    }

    .brand-text h1 {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-black);
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .port-badge {
      font-size: 0.72rem;
      font-weight: 700;
      background: var(--bg-card-subtle);
      color: var(--text-black);
      border: 1px solid var(--border-light);
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
    }

    .brand-text p {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .btn {
      padding: 0.65rem 1.15rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: 1px solid transparent;
      font-family: inherit;
    }

    .btn-black {
      background: var(--black-btn);
      color: #ffffff;
    }

    .btn-black:hover {
      background: var(--black-btn-hover);
      transform: translateY(-1px);
    }

    .btn-white {
      background: #ffffff;
      border-color: var(--border-light);
      color: var(--text-black);
    }

    .btn-white:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    /* Status Banner */
    .status-banner {
      background: #ffffff;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      padding: 1.4rem 1.8rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1.25rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
    }

    .banner-left {
      display: flex;
      align-items: center;
      gap: 1.1rem;
    }

    .status-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #000000;
      position: relative;
    }

    .status-dot.healthy {
      background: #0f172a;
    }

    .status-dot.healthy::after {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 1px solid #0f172a;
      animation: pulse-ring 2s infinite;
    }

    @keyframes pulse-ring {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(2.6); opacity: 0; }
    }

    .banner-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-black);
      letter-spacing: -0.01em;
    }

    .banner-desc {
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    .banner-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.82rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    .banner-meta strong {
      color: var(--text-black);
    }

    /* Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2.25rem;
    }

    .card {
      background: #ffffff;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      padding: 1.6rem;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.04);
    }

    .card:hover {
      border-color: #cbd5e1;
      box-shadow: 0 4px 12px 0 rgb(0 0 0 / 0.08);
      transform: translateY(-2px);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .card-title-group h2 {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-black);
      letter-spacing: -0.01em;
    }

    .card-subtitle {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }

    .badge-mono {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: 'JetBrains Mono', monospace;
    }

    .badge-black {
      background: #000000;
      color: #ffffff;
      border: 1px solid #000000;
    }

    .badge-outline {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid var(--border-light);
    }

    .badge-error {
      background: #000000;
      color: #ffffff;
      border: 1px solid #ef4444;
    }

    .card-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .card-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-light);
    }

    .stat-label {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 0.25rem;
    }

    .stat-value {
      font-size: 0.95rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-black);
    }

    .code-box {
      margin-top: 1rem;
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
      background: var(--bg-card-subtle);
      border: 1px solid var(--border-light);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
      overflow-x: auto;
      white-space: nowrap;
    }

    /* Endpoint Directory */
    .section-title {
      font-size: 1.15rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-black);
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .endpoints-card {
      background: #ffffff;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 2.5rem;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.04);
    }

    .endpoint-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border-light);
      font-size: 0.85rem;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .endpoint-row:last-child {
      border-bottom: none;
    }

    .endpoint-left {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      font-family: 'JetBrains Mono', monospace;
    }

    .method {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      font-family: 'JetBrains Mono', monospace;
    }

    .method-get {
      background: #000000;
      color: #ffffff;
    }

    .method-post {
      background: var(--bg-card-subtle);
      color: var(--text-black);
      border: 1px solid #cbd5e1;
    }

    .endpoint-path {
      color: var(--text-black);
      font-weight: 600;
    }

    .endpoint-desc {
      color: var(--text-muted);
      font-size: 0.82rem;
    }

    /* Footer */
    .footer {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      padding-top: 1.5rem;
      border-top: 1px solid var(--border-light);
      width: 100%;
    }

    .footer a {
      color: var(--text-black);
      font-weight: 600;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="brand">
        <div class="brand-logo">SM</div>
        <div class="brand-text">
          <h1>SIPMAS <span class="port-badge">PORT 5001</span></h1>
          <p>Layar Monitoring & Diagnostik Sistem Backend</p>
        </div>
      </div>
      <div class="header-actions">
        <button id="btn-refresh" class="btn btn-white" onclick="refreshStatus()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Segarkan Data (<span id="countdown">5</span>s)
        </button>
        <a href="http://localhost:3000" target="_blank" class="btn btn-black">
          Buka Web Warga (3000) ↗
        </a>
      </div>
    </header>

    <!-- Overall Status Banner -->
    <div class="status-banner">
      <div class="banner-left">
        <div id="main-status-dot" class="status-dot ${health.status === 'OPERATIONAL' ? 'healthy' : ''}"></div>
        <div>
          <div id="main-status-title" class="banner-title">
            ${health.status === 'OPERATIONAL' ? 'Seluruh Sistem Backend Berjalan Normal' : 'Ada Layanan yang Membutuhkan Perhatian'}
          </div>
          <div class="banner-desc">Status REST API, Database MySQL, NLP Classifier, dan Mailer</div>
        </div>
      </div>
      <div class="banner-meta">
        <div>UPTIME: <strong id="uptime-val">${formatUptime(health.uptime)}</strong></div>
        <div>RAM: <strong id="ram-val">${health.memory.rssMb} MB</strong></div>
        <div>ENV: <strong>${health.server.env.toUpperCase()}</strong></div>
      </div>
    </div>

    <!-- Cards Grid -->
    <div class="grid">
      <!-- 1. Node.js Express Server -->
      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h2>Express API Server</h2>
            <div class="card-subtitle">Node.js ${health.server.nodeVersion} (${health.server.platform})</div>
          </div>
          <span class="badge-mono badge-black">ONLINE</span>
        </div>
        <p class="card-desc">
          Melayani REST API, otentikasi JWT Cookie, proteksi middleware, dan upload berkas.
        </p>
        <div class="card-stats">
          <div>
            <div class="stat-label">Port Aktif</div>
            <div class="stat-value">5001</div>
          </div>
          <div>
            <div class="stat-label">Heap Memory</div>
            <div id="heap-val" class="stat-value">${health.memory.heapUsedMb} MB</div>
          </div>
        </div>
        <div class="code-box">Base URL: http://localhost:5001</div>
      </div>

      <!-- 2. Database MySQL (Prisma) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h2>Database MySQL</h2>
            <div class="card-subtitle">Prisma ORM Client v6</div>
          </div>
          <span id="db-badge" class="badge-mono ${health.database.status === 'healthy' ? 'badge-black' : 'badge-error'}">
            ${health.database.status === 'healthy' ? 'TERHUBUNG' : 'TERPUTUS'}
          </span>
        </div>
        <p class="card-desc">
          Penyimpanan data tabel Pengguna, Aduan Warga, Riwayat, dan Status Verifikasi OTP.
        </p>
        <div class="card-stats">
          <div>
            <div class="stat-label">Latensi Query</div>
            <div id="db-latency" class="stat-value">${health.database.latencyMs} ms</div>
          </div>
          <div>
            <div class="stat-label">Database Target</div>
            <div id="db-target" class="stat-value">${health.database.name}</div>
          </div>
        </div>
        <div id="db-code" class="code-box">${health.database.error ? 'Error: ' + health.database.error : health.database.url}</div>
      </div>

      <!-- 3. Microservice NLP Python -->
      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h2>NLP AI Classifier</h2>
            <div class="card-subtitle">Python 3.12 Flask + Gunicorn</div>
          </div>
          <span id="nlp-badge" class="badge-mono ${health.nlpService.status === 'healthy' ? 'badge-black' : 'badge-error'}">
            ${health.nlpService.status === 'healthy' ? 'MODEL AKTIF' : 'TERPUTUS'}
          </span>
        </div>
        <p class="card-desc">
          Memprediksi kategori aduan warga otomatis: <i>infrastruktur</i>, <i>lingkungan</i>, atau <i>pelayanan</i>.
        </p>
        <div class="card-stats">
          <div>
            <div class="stat-label">Latensi Ping</div>
            <div id="nlp-latency" class="stat-value">${health.nlpService.latencyMs} ms</div>
          </div>
          <div>
            <div class="stat-label">Algoritma ML</div>
            <div class="stat-value">SVM + TF-IDF</div>
          </div>
        </div>
        <div id="nlp-code" class="code-box">${health.nlpService.error ? 'Error: ' + health.nlpService.error : health.nlpService.url}</div>
      </div>

      <!-- 4. Mailer Service (MailHog / SMTP) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title-group">
            <h2>Layanan Email OTP</h2>
            <div class="card-subtitle">Nodemailer SMTP Client</div>
          </div>
          <a href="http://localhost:8026" target="_blank" class="badge-mono badge-outline" style="text-decoration: none;">
            MAILHOG :8026 ↗
          </a>
        </div>
        <p class="card-desc">
          Mengirim kode OTP 6-digit saat warga mendaftar akun atau mereset kata sandi.
        </p>
        <div class="card-stats">
          <div>
            <div class="stat-label">SMTP Host</div>
            <div class="stat-value">${health.mailService.host}</div>
          </div>
          <div>
            <div class="stat-label">SMTP Port</div>
            <div class="stat-value">${health.mailService.port}</div>
          </div>
        </div>
        <div class="code-box">Inbox Web UI: http://localhost:8026</div>
      </div>
    </div>

    <!-- Active API Routes Directory -->
    <div class="section-title">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
      Direktori Endpoint REST API
    </div>
    <div class="endpoints-card">
      <div class="endpoint-row">
        <div class="endpoint-left">
          <span class="method method-get">GET</span>
          <span class="endpoint-path">/health</span>
        </div>
        <div class="endpoint-desc">Liveness check standar untuk Docker healthcheck</div>
      </div>
      <div class="endpoint-row">
        <div class="endpoint-left">
          <span class="method method-get">GET</span>
          <span class="endpoint-path">/api/status</span>
        </div>
        <div class="endpoint-desc">Live JSON diagnostics (latensi DB, status NLP, alokasi memori)</div>
      </div>
      <div class="endpoint-row">
        <div class="endpoint-left">
          <span class="method method-post">POST</span>
          <span class="endpoint-path">/api/auth/login</span>
        </div>
        <div class="endpoint-desc">Login warga & admin (menerbitkan JWT via httpOnly cookie)</div>
      </div>
      <div class="endpoint-row">
        <div class="endpoint-left">
          <span class="method method-post">POST</span>
          <span class="endpoint-path">/api/auth/register</span>
        </div>
        <div class="endpoint-desc">Pendaftaran akun warga baru & pengiriman kode OTP</div>
      </div>
      <div class="endpoint-row">
        <div class="endpoint-left">
          <span class="method method-post">POST</span>
          <span class="endpoint-path">/api/laporan</span>
        </div>
        <div class="endpoint-desc">Pengiriman laporan aduan warga (dengan upload bukti foto & auto NLP)</div>
      </div>
      <div class="endpoint-row">
        <div class="endpoint-left">
          <span class="method method-get">GET</span>
          <span class="endpoint-path">/api/admin/analytics</span>
        </div>
        <div class="endpoint-desc">Agregasi data analitik & kategori laporan untuk dashboard admin</div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      SIPMAS Refactor v2.0 • Arsitektur Monorepo Microservices • Dibuat dengan Express, Next.js, dan Python NLP
    </footer>
  </div>

  <script>
    let timeLeft = 5;
    const countdownEl = document.getElementById('countdown');

    async function refreshStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

        // Update overall
        const isHealthy = data.status === 'OPERATIONAL';
        const dot = document.getElementById('main-status-dot');
        dot.className = 'status-dot ' + (isHealthy ? 'healthy' : '');
        document.getElementById('main-status-title').innerText = isHealthy 
          ? 'Seluruh Sistem Backend Berjalan Normal' 
          : 'Ada Layanan yang Membutuhkan Perhatian';

        // Update meta
        document.getElementById('ram-val').innerText = data.memory.rssMb + ' MB';
        document.getElementById('heap-val').innerText = data.memory.heapUsedMb + ' MB';

        // Update DB
        const dbBadge = document.getElementById('db-badge');
        dbBadge.className = 'badge-mono ' + (data.database.status === 'healthy' ? 'badge-black' : 'badge-error');
        dbBadge.innerText = data.database.status === 'healthy' ? 'TERHUBUNG' : 'TERPUTUS';
        document.getElementById('db-latency').innerText = data.database.latencyMs + ' ms';
        const dbTargetEl = document.getElementById('db-target');
        if (dbTargetEl && data.database.name) {
          dbTargetEl.innerText = data.database.name;
        }
        if (data.database.error) {
          document.getElementById('db-code').innerText = 'Error: ' + data.database.error;
        }

        // Update NLP
        const nlpBadge = document.getElementById('nlp-badge');
        nlpBadge.className = 'badge-mono ' + (data.nlpService.status === 'healthy' ? 'badge-black' : 'badge-error');
        nlpBadge.innerText = data.nlpService.status === 'healthy' ? 'MODEL AKTIF' : 'TERPUTUS';
        document.getElementById('nlp-latency').innerText = data.nlpService.latencyMs + ' ms';
        if (data.nlpService.error) {
          document.getElementById('nlp-code').innerText = 'Error: ' + data.nlpService.error;
        }

        timeLeft = 5;
      } catch (err) {
        console.error('Gagal mengambil status:', err);
      }
    }

    // Auto-refresh timer
    setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        refreshStatus();
      } else {
        countdownEl.innerText = timeLeft;
      }
    }, 1000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}
