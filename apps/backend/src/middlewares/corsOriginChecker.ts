export function corsOriginChecker(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) {
  // Allow requests with no origin (like mobile apps, curl, or server-to-server)
  if (!origin) return callback(null, true);

  // Dev flexible mode via explicit environment variable only
  if (process.env.CORS_ALLOW_ALL === 'true') {
    return callback(null, true);
  }

  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error('Not allowed by CORS'));
}
