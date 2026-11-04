import { createMailTransport, getMailFrom } from '../lib/mailer';

describe('Standardized Mailer (src/lib/mailer.ts)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env ke snapshot awal sebelum tiap test
    process.env = { ...originalEnv };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('createMailTransport', () => {
    it('fallback host ke localhost dan port ke 1025 bila SMTP_HOST dan SMTP_PORT kosong', () => {
      const transporter: any = createMailTransport();
      expect(transporter.options.host).toBe('localhost');
      expect(transporter.options.port).toBe(1025);
    });

    it('memakai host dari SMTP_HOST bila disediakan', () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      const transporter: any = createMailTransport();
      expect(transporter.options.host).toBe('smtp.gmail.com');
    });

    it('menyetel secure = true HANYA pada port 465', () => {
      process.env.SMTP_PORT = '465';
      const transport465: any = createMailTransport();
      expect(transport465.options.secure).toBe(true);

      process.env.SMTP_PORT = '587';
      const transport587: any = createMailTransport();
      expect(transport587.options.secure).toBe(false);

      process.env.SMTP_PORT = '1025';
      const transport1025: any = createMailTransport();
      expect(transport1025.options.secure).toBe(false);
    });

    it('auth TIDAK dipasang bila user atau pass kosong/tidak terisi', () => {
      // 1. Keduanya kosong
      const t1: any = createMailTransport();
      expect(t1.options.auth).toBeUndefined();

      // 2. Hanya user yang terisi, pass kosong
      process.env.SMTP_USER = 'pengguna@example.com';
      process.env.SMTP_PASS = '';
      const t2: any = createMailTransport();
      expect(t2.options.auth).toBeUndefined();

      // 3. Hanya pass yang terisi, user kosong
      process.env.SMTP_USER = '';
      process.env.SMTP_PASS = 'secretpass';
      const t3: any = createMailTransport();
      expect(t3.options.auth).toBeUndefined();

      // 4. Keduanya spasi saja
      process.env.SMTP_USER = '   ';
      process.env.SMTP_PASS = '   ';
      const t4: any = createMailTransport();
      expect(t4.options.auth).toBeUndefined();
    });

    it('auth dipasang bila SMTP_USER dan SMTP_PASS keduanya terisi', () => {
      process.env.SMTP_USER = 'pengguna@example.com';
      process.env.SMTP_PASS = 'app-password-rahasia';
      const transporter: any = createMailTransport();
      expect(transporter.options.auth).toEqual({
        user: 'pengguna@example.com',
        pass: 'app-password-rahasia',
      });
    });

    it('memasang connection, greeting, dan socket timeout 10 detik', () => {
      const transporter: any = createMailTransport();
      expect(transporter.options.connectionTimeout).toBe(10000);
      expect(transporter.options.greetingTimeout).toBe(10000);
      expect(transporter.options.socketTimeout).toBe(10000);
    });
  });

  describe('getMailFrom', () => {
    it('memakai SMTP_FROM bila ada dan terisi', () => {
      process.env.SMTP_FROM = '"SIPMAS Resmi" <lapor@sipmas.go.id>';
      const result = getMailFrom('SIPMAS Pendaftaran');
      expect(result).toBe('"SIPMAS Resmi" <lapor@sipmas.go.id>');
    });

    it('fallback ke "<label>" <noreply@sipmas.go.id> bila SMTP_FROM kosong atau tidak diset', () => {
      // 1. Undefined
      expect(getMailFrom('SIPMAS Pendaftaran')).toBe('"SIPMAS Pendaftaran" <noreply@sipmas.go.id>');
      expect(getMailFrom('SIPMAS Keamanan')).toBe('"SIPMAS Keamanan" <noreply@sipmas.go.id>');

      // 2. String kosong
      process.env.SMTP_FROM = '';
      expect(getMailFrom('SIPMAS Pendaftaran')).toBe('"SIPMAS Pendaftaran" <noreply@sipmas.go.id>');

      // 3. String whitespace saja
      process.env.SMTP_FROM = '   ';
      expect(getMailFrom('SIPMAS Pendaftaran')).toBe('"SIPMAS Pendaftaran" <noreply@sipmas.go.id>');

      // 4. Tanpa label
      delete process.env.SMTP_FROM;
      expect(getMailFrom()).toBe('<noreply@sipmas.go.id>');
    });
  });
});
