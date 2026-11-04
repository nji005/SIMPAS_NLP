import { corsOriginChecker } from '../middlewares/corsOriginChecker';

describe('corsOriginChecker', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('harus mengizinkan request tanpa origin (mobile apps, curl, server-to-server)', (done) => {
    corsOriginChecker(undefined, (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('harus mengizinkan request dari localhost:3000', (done) => {
    corsOriginChecker('http://localhost:3000', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('harus mengizinkan request dari 127.0.0.1:3000', (done) => {
    corsOriginChecker('http://127.0.0.1:3000', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('harus mengizinkan request dari localhost:3001 dan 127.0.0.1:3001 (fallback port dev)', (done) => {
    corsOriginChecker('http://localhost:3001', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      corsOriginChecker('http://127.0.0.1:3001', (err2, allow2) => {
        expect(err2).toBeNull();
        expect(allow2).toBe(true);
        done();
      });
    });
  });

  it('harus mengizinkan request dari custom FRONTEND_URL yang diset di env', (done) => {
    process.env.FRONTEND_URL = 'https://sipmas.example.com';
    corsOriginChecker('https://sipmas.example.com', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('harus menolak request dari origin yang tidak ada di allowlist dengan Error', (done) => {
    corsOriginChecker('https://malicious-attacker.com', (err, allow) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('Not allowed by CORS');
      expect(allow).toBeUndefined();
      done();
    });
  });

  it('harus mengizinkan origin sembarang jika CORS_ALLOW_ALL=true', (done) => {
    process.env.CORS_ALLOW_ALL = 'true';
    corsOriginChecker('https://arbitrary-dev-domain.com', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });
});
