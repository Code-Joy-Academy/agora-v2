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
  const { course_id, title, buffer, format, resource_type, node_id } = opts;
  const text = await parseToText(buffer, format);
  const chunks = chunkMarkdown(text);
  const embedder = getEmbeddingProvider();

  return withCourseScope(course_id, async (client) => {
    const { rows: docRows } = await client.query(
      `INSERT INTO documents (course_id, node_id, title, resource_type, source_format, raw_content)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [course_id, node_id ?? null, title, resource_type, format, text]
    );
    const document_id = docRows[0].id;

    let embedded = false;
    for (const c of chunks) {
      const vector = await embedder.embed(c.content);
      if (vector) embedded = true;
      await client.query(
        `INSERT INTO document_chunks (document_id, course_id, node_id, heading, content, chunk_index, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [document_id, course_id, node_id ?? null, c.heading, c.content, c.chunk_index, vector ? `[${vector.join(',')}]` : null]
      );
    }
    return { document_id, chunk_count: chunks.length, embedded };
  });
}
