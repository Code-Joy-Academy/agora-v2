import { GoogleGenAI } from '@google/genai';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[] | null>;
}

/**
 * Fallback provider.
 *
 * When Gemini is unavailable or no API key is configured,
 * document_chunks.embedding remains NULL and retrieval can
 * fall back to lexical/keyword search.
 */
export class LexicalStubProvider implements EmbeddingProvider {
  async embed(_text: string): Promise<number[] | null> {
    return null;
  }
}

/**
 * Gemini embedding provider.
 *
 * Uses:
 *
 *   gemini-embedding-001
 *
 * with:
 *
 *   768 dimensions
 *
 * to match PostgreSQL:
 *
 *   vector(768)
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({
      apiKey,
    });
  }

  /**
   * Sleep helper used for exponential backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate an embedding with retries for transient Gemini errors.
   *
   * Retries:
   *   attempt 1 → immediate
   *   attempt 2 → 1 second
   *   attempt 3 → 2 seconds
   *   attempt 4 → 4 seconds
   *   attempt 5 → 8 seconds
   */
  async embed(text: string): Promise<number[] | null> {
    const cleanedText = text?.trim();

    // Never send empty content to Gemini.
    if (!cleanedText) {
      return null;
    }

    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: cleanedText,
          config: {
            outputDimensionality: 768,
          },
        });

        const values = response.embeddings?.[0]?.values;

        if (!values || values.length === 0) {
          return null;
        }

        if (values.length !== 768) {
          throw new Error(
            `Gemini embedding dimension mismatch: expected 768, received ${values.length}.`
          );
        }

        return values;
      } catch (error: any) {
        const status = error?.status;

        const isRetryable =
          status === 408 ||
          status === 429 ||
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504;

        // Don't retry permanent/client errors.
        if (!isRetryable || attempt === maxAttempts) {
          console.error(
            `[embedding] Failed after ${attempt} attempt(s):`,
            error
          );

          // Return null so ingestion can continue and lexical
          // retrieval can be used for this chunk.
          return null;
        }

        const delay = 1000 * Math.pow(2, attempt - 1);

        console.warn(
          `[embedding] Gemini returned ${status}. ` +
          `Retrying in ${delay}ms ` +
          `(attempt ${attempt + 1}/${maxAttempts})...`
        );

        await this.sleep(delay);
      }
    }

    return null;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.warn(
      '[embedding] GEMINI_API_KEY is not configured. ' +
      'Using lexical retrieval fallback.'
    );

    return new LexicalStubProvider();
  }

  return new GeminiEmbeddingProvider(apiKey);
}

