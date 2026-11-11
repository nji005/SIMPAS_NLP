import express from 'express';
import http from 'http';
import { Duplex } from 'stream';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authLimiter } from '../middlewares/rateLimiter';
import { login } from '../modules/auth/auth.controller';

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
  },
}));

function dispatchMockRequest(
  app: express.Express,
  options: {
    method: string;
    url: string;
    remoteAddress: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  }
): Promise<{
  status: number;
  headers: http.OutgoingHttpHeaders;
  body: any;
}> {
  return new Promise((resolve) => {
    const socket = new Duplex({ read() {} }) as any;
    socket.remoteAddress = options.remoteAddress;
    socket.destroy = () => {};

    const req = new http.IncomingMessage(socket);
    req.method = options.method;
    req.url = options.url;
    req.headers = {
      ...(options.headers || {}),
    };
    if (options.body !== undefined) {
      (req as any).body = options.body;
    }

    const res = new http.ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: any, ...args: any[]) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return origWrite(chunk, ...args);
    }) as any;

    res.end = ((chunk?: any, ...args: any[]) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed: any = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // biarkan string mentah bila bukan JSON
      }
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: parsed,
      });
      return origEnd(chunk, ...args);
    }) as any;

    (app as any)(req, res);
  });
}

describe('TRUST_PROXY=2 dan Cookie Secure di Balik Proxy Cloudflare -> cloudflared -> Caddy', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'ganti-dengan-nilai-test-yang-cukup-panjang',
      TRUST_PROXY: '2',
    };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createAppWithServerTrustProxy(trustProxyValue: string) {
    const app = express();
    const trustHops = parseInt(trustProxyValue, 10);
    app.set('trust proxy', isNaN(trustHops) ? trustProxyValue : trustHops);
    app.use(express.json());
    return app;
  }

  it('resolves visitor IP asli (bukan IP cloudflared) dan memisahkan bucket authLimiter per IP visitor dengan TRUST_PROXY=2', async () => {
    const app = createAppWithServerTrustProxy('2');
    app.post('/api/auth/probe-login', authLimiter, (req, res) => {
      return res.status(200).json({
        ip: req.ip,
        ips: req.ips,
        protocol: req.protocol,
        secure: req.secure,
      });
    });

    // Rantai: visitor -> Cloudflare -> cloudflared (172.20.0.5) -> Caddy (172.20.0.3) -> backend
    // Caddy dengan trusted_proxies static private_ranges meneruskan X-Forwarded-For: "<visitor>, <cloudflared>"
    const probeA = await dispatchMockRequest(app, {
      method: 'POST',
      url: '/api/auth/probe-login',
      remoteAddress: '172.20.0.3',
      headers: {
        'x-forwarded-for': '203.0.113.10, 172.20.0.5',
        'x-forwarded-proto': 'https',
      },
    });
    expect(probeA.status).toBe(200);
    expect(probeA.body.ip).toBe('203.0.113.10');
    expect(probeA.body.protocol).toBe('https');
    expect(probeA.body.secure).toBe(true);

    // Klien mencoba spoofing XFF di depan Cloudflare: Cloudflare tetap menempatkan IP asli sebelum cloudflared
    const probeSpoof = await dispatchMockRequest(app, {
      method: 'POST',
      url: '/api/auth/probe-login',
      remoteAddress: '172.20.0.3',
      headers: {
        'x-forwarded-for': '9.9.9.9, 203.0.113.20, 172.20.0.5',
        'x-forwarded-proto': 'https',
      },
    });
    expect(probeSpoof.status).toBe(200);
    expect(probeSpoof.body.ip).toBe('203.0.113.20');

    // Habiskan kuota authLimiter (20 req/15m) untuk visitor 198.51.100.77 lewat cloudflared 172.20.0.5
    for (let i = 1; i <= 20; i++) {
      const okRes = await dispatchMockRequest(app, {
        method: 'POST',
        url: '/api/auth/probe-login',
        remoteAddress: '172.20.0.3',
        headers: {
          'x-forwarded-for': '198.51.100.77, 172.20.0.5',
          'x-forwarded-proto': 'https',
        },
      });
      expect(okRes.status).toBe(200);
    }

    const blockedRes = await dispatchMockRequest(app, {
      method: 'POST',
      url: '/api/auth/probe-login',
      remoteAddress: '172.20.0.3',
      headers: {
        'x-forwarded-for': '198.51.100.77, 172.20.0.5',
        'x-forwarded-proto': 'https',
      },
    });
    expect(blockedRes.status).toBe(429);

    // Pengunjung lain lewat cloudflared yang sama TIDAK ikut terkena limit (terbukti tidak disatukan ke IP proxy)
    const otherVisitorRes = await dispatchMockRequest(app, {
      method: 'POST',
      url: '/api/auth/probe-login',
      remoteAddress: '172.20.0.3',
      headers: {
        'x-forwarded-for': '198.51.100.88, 172.20.0.5',
        'x-forwarded-proto': 'https',
      },
    });
    expect(otherVisitorRes.status).toBe(200);
    expect(otherVisitorRes.body.ip).toBe('198.51.100.88');
  });

  it('menerbitkan cookie HttpOnly + Secure + SameSite=Lax saat login produksi di balik reverse proxy HTTP internal', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 7,
      nama: 'Warga Uji Proxy',
      email: 'warga@example.test',
      password: 'hashed-password',
      role: 'WARGA',
      isVerified: true,
      tokenVersion: 0,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const app = createAppWithServerTrustProxy('2');
    app.post('/api/auth/login', login);

    const loginRes = await dispatchMockRequest(app, {
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '172.20.0.3',
      headers: {
        'x-forwarded-for': '203.0.113.55, 172.20.0.5',
        'x-forwarded-proto': 'https',
      },
      body: {
        email: 'warga@example.test',
        password: 'password-uji',
      },
    });

    expect(loginRes.status).toBe(200);
    const setCookieHeader = loginRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [String(setCookieHeader || '')];
    const tokenCookie = cookies.find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toContain('HttpOnly');
    expect(tokenCookie).toContain('Secure');
    expect(tokenCookie).toMatch(/SameSite=Lax/i);
  });
});

