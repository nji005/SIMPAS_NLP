import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        return res.status(400).json({
          message: firstIssue?.message || 'Validasi data gagal.',
          errors: error.issues,
        });
      }
      return res.status(400).json({ message: 'Data yang dikirim tidak valid.' });
    }
  };
}

export const createLaporanSchema = z.object({
  judul: z
    .string({ required_error: 'Judul laporan wajib diisi!' })
    .trim()
    .min(1, 'Judul laporan wajib diisi!')
    .max(150, 'Judul laporan maksimal 150 karakter!'),
  isi: z
    .string({ required_error: 'Isi laporan wajib diisi!' })
    .trim()
    .min(1, 'Isi laporan wajib diisi!')
    .max(5000, 'Isi laporan maksimal 5000 karakter!'),
  lokasi: z
    .string()
    .trim()
    .max(191, 'Lokasi maksimal 191 karakter!')
    .optional()
    .default('Tidak diketahui'),
  tanggal: z
    .string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true;
      const d = new Date(val);
      return !isNaN(d.getTime());
    }, { message: 'Format tanggal tidak valid!' }),
  kategori: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return undefined;
      const allowed = ['Infrastruktur', 'Lingkungan', 'Pelayanan', 'Lainnya'];
      const matched = allowed.find(
        (cat) => cat.toLowerCase() === val.trim().toLowerCase()
      );
      // Di luar daftar putih otomatis menjadi 'Lainnya'
      return matched || 'Lainnya';
    }),
});

export const patchLaporanStatusSchema = z.object({
  id: z.coerce.number().int({ message: 'ID laporan harus berupa integer!' }).positive({ message: 'ID laporan harus berupa angka positif!' }),
  status: z.enum(['PENDING', 'PROSES'], {
    errorMap: () => ({ message: 'Status tidak valid! Hanya PENDING atau PROSES. Untuk menyelesaikan laporan, sertakan tanggapan pada form penyelesaian.' }),
  }),
});

export const selesaikanLaporanSchema = z.object({
  catatanSelesai: z
    .string({ required_error: 'Tanggapan penyelesaian wajib diisi.' })
    .trim()
    .min(10, 'Tanggapan penyelesaian minimal 10 karakter.')
    .max(2000, 'Tanggapan penyelesaian maksimal 2000 karakter.'),
});

export const patchUserRoleSchema = z.object({
  id: z.coerce.number().int({ message: 'ID pengguna harus berupa integer!' }).positive({ message: 'ID pengguna harus berupa angka positif!' }),
  role: z.enum(['WARGA', 'ADMIN'], {
    errorMap: () => ({ message: 'Role tidak valid! Hanya WARGA atau ADMIN.' }),
  }),
});
