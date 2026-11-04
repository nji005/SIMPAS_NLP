import nodemailer from 'nodemailer';

/**
 * Membuat transporter Nodemailer terstandarisasi untuk pengiriman email transaksional SIPMAS.
 * - Host default: process.env.SMTP_HOST atau 'localhost'
 * - Port default: process.env.SMTP_PORT atau 1025 (MailHog/Mailpit dev)
 * - secure: true hanya bila port 465 (SMTPS), false untuk port lainnya (587 STARTTLS / 1025 plain)
 * - auth: hanya dipasang jika SMTP_USER dan SMTP_PASS keduanya terisi dan tidak kosong
 * - Timeout: 10 detik agar permintaan pengiriman tidak menggantung jika SMTP bermasalah
 */
export function createMailTransport(overrides?: Partial<nodemailer.TransportOptions>) {
  const host = process.env.SMTP_HOST || 'localhost';
  const port = Number(process.env.SMTP_PORT) || 1025;
  const secure = port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const transportOptions: any = {
    host,
    port,
    secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    ...overrides,
  };

  if (user && pass && user.trim() !== '' && pass.trim() !== '') {
    transportOptions.auth = {
      user: user.trim(),
      pass: pass.trim(),
    };
  }

  return nodemailer.createTransport(transportOptions);
}

/**
 * Mengembalikan alamat pengirim email terstandarisasi.
 * Jika SMTP_FROM terdefinisi pada environment, gunakan nilai tersebut.
 * Jika tidak, fallback ke format default: `"<label>" <noreply@sipmas.go.id>`.
 */
export function getMailFrom(label?: string): string {
  const customFrom = process.env.SMTP_FROM;
  if (customFrom && customFrom.trim() !== '') {
    return customFrom.trim();
  }
  return label ? `"${label}" <noreply@sipmas.go.id>` : '<noreply@sipmas.go.id>';
}
