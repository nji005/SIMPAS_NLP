export interface AuthUser {
  id: number;
  nama?: string;
  email: string;
  role: 'WARGA' | 'ADMIN';
  tokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
