import { Request, Response } from 'express';
import { predictCategory as nlpPredict } from '../../services/nlpClient';
import { logger } from '../../lib/logger';

export async function predictCategory(req: Request, res: Response) {
  try {
    const { text } = req.body;

    if (typeof text === 'string' && text.length > 2000) {
      return res.status(400).json({ message: 'Teks terlalu panjang! Maksimal 2000 karakter.' });
    }

    if (!text || (typeof text === 'string' && text.trim() === "")) {
      return res.status(200).json({ category: "" });
    }

    const result = await nlpPredict(text);
    if (!result) {
      return res.status(200).json({ category: "", confidence: 0, uncertain: true });
    }

    return res.status(200).json({
      category: result.category,
      confidence: result.confidence,
      uncertain: result.uncertain,
    });
  } catch (error) {
    logger.error({ err: error }, 'Gagal terhubung ke Flask NLP Service');
    return res.status(503).json({ error: "Layanan klasifikasi otomatis sedang offline." });
  }
}

