export interface EmbeddingProvider {
  embed(text: string): Promise<number[] | null>; // null means "no vector — fall back to lexical retrieval"
}

// Default: no real embedding call. document_chunks.embedding stays null and
// retrieval falls back to keyword scoring. Zero external dependency to run.
export class LexicalStubProvider implements EmbeddingProvider {
  async embed(): Promise<number[] | null> {
    return null;
  }
}

// Real embeddings via Gemini's text-embedding-004 (768 dims — matches the
// `vector(768)` column in schema.sql). Activate by setting GEMINI_API_KEY;
// the ingestion service picks this provider automatically when the key is present.
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private modelPromise: Promise<import('@google/generative-ai').GenerativeModel>;

  constructor(apiKey: string) {
    this.modelPromise = import('@google/generative-ai').then(({ GoogleGenerativeAI }) =>
      new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'text-embedding-004' })
    );
  }

  async embed(text: string): Promise<number[] | null> {
    const model = await this.modelPromise;
    const result = await model.embedContent(text);
    return result.embedding.values;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return process.env.GEMINI_API_KEY ? new GeminiEmbeddingProvider(process.env.GEMINI_API_KEY) : new LexicalStubProvider();
}
