import { withCourseScope } from '../db/pool.js';
import { chunkMarkdown } from './chunker.js';
import { parseToText, type SourceFormat } from './parsers.js';
import { getEmbeddingProvider } from './embeddings.js';

export type ResourceType = 'notes' | 'rubric' | 'assignment_guidelines';

export async function ingestDocument(opts: {
  course_id: string;
  title: string;
  buffer: Buffer;
  format: SourceFormat;
  resource_type: ResourceType;
  node_id?: string | null;
}) {
  const {
    course_id,
    title,
    buffer,
    format,
    resource_type,
    node_id,
  } = opts;

  // ------------------------------------------------------------
  // 1. Extract text from the source document
  // ------------------------------------------------------------

  const text = await parseToText(buffer, format);
  const cleanedText = text?.trim();

  if (!cleanedText) {
    throw new Error(
      `Unable to ingest "${title}": no text could be extracted from the document.`
    );
  }

  // ------------------------------------------------------------
  // 2. Split the document into chunks
  // ------------------------------------------------------------

  const rawChunks = chunkMarkdown(cleanedText);

  // Remove empty chunks before they reach the embedding API.
  const chunks = rawChunks
    .map((chunk) => ({
      ...chunk,
      content: chunk.content?.trim() ?? '',
      heading: chunk.heading?.trim() || null,
    }))
    .filter((chunk) => chunk.content.length > 0);

  if (chunks.length === 0) {
    throw new Error(
      `Unable to ingest "${title}": no non-empty chunks were produced.`
    );
  }

  const embedder = getEmbeddingProvider();

  // ------------------------------------------------------------
  // 3. Store the document and chunks in one course-scoped operation
  // ------------------------------------------------------------

  return withCourseScope(course_id, async (client) => {
    const { rows: docRows } = await client.query(
      `INSERT INTO documents (
        course_id,
        node_id,
        title,
        resource_type,
        source_format,
        raw_content
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        course_id,
        node_id ?? null,
        title,
        resource_type,
        format,
        cleanedText,
      ]
    );

    const document_id = docRows[0].id;

    let embedded = false;
    let insertedChunkCount = 0;

    // ----------------------------------------------------------
    // 4. Generate embeddings and insert chunks
    // ----------------------------------------------------------

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];

      // Extra defensive check.
      if (!chunk.content.trim()) {
        continue;
      }

      console.log(
        `[ingestion] Embedding chunk ${index + 1}/${chunks.length} ` +
        `(${chunk.content.length} characters)`
      );

      const vector = await embedder.embed(chunk.content);

      if (vector) {
        embedded = true;
      }

      await client.query(
        `INSERT INTO document_chunks (
          document_id,
          course_id,
          node_id,
          heading,
          content,
          chunk_index,
          embedding
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          document_id,
          course_id,
          node_id ?? null,
          chunk.heading,
          chunk.content,
          index,
          vector ? `[${vector.join(',')}]` : null,
        ]
      );

      insertedChunkCount++;
    }

    return {
      document_id,
      chunk_count: insertedChunkCount,
      embedded,
    };
  });
}