import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Muat variabel lingkungan dari root .env atau apps/backend/.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/backend/.env') });

/**
 * Validasi ketat keamanan database:
 * 1. Dilarang berjalan di NODE_ENV=production
 * 2. Database HANYA boleh db_sipmas (dilarang keras menyentuh db_pengaduan atau database lain)
 * 3. Host HANYA boleh localhost / 127.0.0.1 / host.docker.internal / mysql (kontainer lokal)
 */
export function getSafeDatabaseUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ DITOLAK: Uji beban dilarang keras dijalankan di lingkungan produksi (NODE_ENV=production)!');
    process.exit(1);
  }

  let dbUrl = process.env.DATABASE_URL;

  // Bila DATABASE_URL belum ada di environment, gunakan default lokal
  if (!dbUrl) {
    dbUrl = 'mysql://root:@127.0.0.1:3307/db_sipmas';
  }

  // Parse nama database dari URL
  try {
    const parsed = new URL(dbUrl);
    const dbName = parsed.pathname.replace(/^\//, '');

    if (dbName !== 'db_sipmas') {
      console.error(`❌ DITOLAK: Target database adalah "${dbName}"! Uji beban HANYA diizinkan pada database db_sipmas. Dilarang menyentuh database lain!`);
      process.exit(1);
    }

    const hostname = parsed.hostname;
    const allowedHosts = ['localhost', '127.0.0.1', 'host.docker.internal', 'mysql'];
    if (!allowedHosts.includes(hostname)) {
      console.error(`❌ DITOLAK: Host database "${hostname}" tidak diizinkan! Uji beban HANYA boleh berjalan terhadap database lokal.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ DITOLAK: Format DATABASE_URL tidak valid!');
    process.exit(1);
  }

  return dbUrl;
}

export function createSafePrismaClient(databaseUrl?: string): PrismaClient {
  const url = databaseUrl || getSafeDatabaseUrl();
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}
