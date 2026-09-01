import { withCourseScope } from '../db/pool.js';
import { getEmbeddingProvider } from '../ingestion/embeddings.js';
import type { CurriculumNode } from '../types.js';

export interface RetrievedResource {
  source: 'syllabus' | 'notes' | 'rubric' | 'assignment_guidelines';
  heading: string | null;
  content: string;
}

// Synthesizes across the node's own syllabus text plus whatever the teacher has
// uploaded for this course (notes, rubrics, assignment guidelines) — not a
// single-document lookup. Uses pgvector cosine similarity when the course has
// embedded chunks, otherwise falls back to keyword overlap.
export async function retrieveResources(node: CurriculumNode, course_id: string, query: string, k = 4): Promise<RetrievedResource[]> {
  const syllabus: RetrievedResource = {
    source: 'syllabus',
    heading: node.title,
    content: `${node.description}${node.sample_passage ? ` Passage: "${node.sample_passage}"` : ''}`,
  };

  const uploaded = await withCourseScope(course_id, async (client) => {
    const { rows } = await client.query(
      `SELECT dc.heading, dc.content, d.resource_type, dc.embedding
       FROM document_chunks dc JOIN documents d ON d.id = dc.document_id
       WHERE dc.course_id = $1 AND (dc.node_id = $2 OR dc.node_id IS NULL)`,
      [course_id, node.id]
    );
    if (rows.length === 0) return [];

    const hasEmbeddings = rows.some((r) => r.embedding !== null);
    if (hasEmbeddings) {
      const embedder = getEmbeddingProvider();
      const queryVector = await embedder.embed(query);
      if (queryVector) {
        const { rows: ranked } = await client.query(
          `SELECT dc.heading, dc.content, d.resource_type
           FROM document_chunks dc JOIN documents d ON d.id = dc.document_id
           WHERE dc.course_id = $1 AND (dc.node_id = $2 OR dc.node_id IS NULL) AND dc.embedding IS NOT NULL
           ORDER BY dc.embedding <=> $3 LIMIT $4`,
          [course_id, node.id, `[${queryVector.join(',')}]`, k]
        );
        return ranked;
      }
    }

    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    return rows
      .map((r) => ({ ...r, score: terms.reduce((s, t) => s + (`${r.heading ?? ''} ${r.content}`.toLowerCase().includes(t) ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  });

  return [syllabus, ...uploaded.map((r: any) => ({ source: r.resource_type as RetrievedResource['source'], heading: r.heading, content: r.content }))];
}
