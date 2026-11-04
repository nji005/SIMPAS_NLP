import { logger } from '../lib/logger';

export interface NLPPredictResult {
  category: string;
  confidence: number;
  uncertain: boolean;
}

/**
 * Client service to communicate with the Python NLP service.
 * Memiliki batas timeout 5 detik via AbortController; bila error/timeout tetap mengembalikan null.
 */
export async function predictCategory(text: string): Promise<NLPPredictResult | null> {
  const trimmedText = text ? text.trim() : "";
  if (!trimmedText) {
    return null;
  }

  const nlpServiceUrl = process.env.NLP_SERVICE_URL || "http://127.0.0.1:5000";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  timeoutId.unref?.();

  try {
    const response = await fetch(`${nlpServiceUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: trimmedText }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, '[NLP Client] Service returned status non-OK');
      return null;
    }

    const data = (await response.json()) as { category?: string; confidence?: number; uncertain?: boolean };
    if (!data || !data.category) {
      return null;
    }

    return {
      category: data.category,
      confidence: typeof data.confidence === "number" ? data.confidence : 1.0,
      uncertain: typeof data.uncertain === "boolean" ? data.uncertain : false,
    };
  } catch (error) {
    logger.warn({ err: (error as Error).message }, '[NLP Client] Gagal terhubung atau timeout ke NLP service');
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
