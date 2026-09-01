export interface Chunk {
  heading: string | null;
  content: string;
  chunk_index: number;
}

// Splits on markdown headings (# / ## / ###) and keeps math blocks ($$...$$) intact
// by never breaking inside them, even if a heading regex would otherwise match.
export function chunkMarkdown(raw: string): Chunk[] {
  const mathGuard = raw.split(/(\$\$[\s\S]*?\$\$)/g);
  const safe = mathGuard.map((seg) => (seg.startsWith('$$') ? seg.replace(/\n/g, '\u0000') : seg)).join('');

  const parts = safe.split(/^(#{1,3}\s.+)$/m).filter((p) => p.trim().length > 0);
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let index = 0;

  for (const part of parts) {
    if (/^#{1,3}\s/.test(part)) {
      heading = part.replace(/^#{1,3}\s/, '').trim();
      continue;
    }
    const content = part.replace(/\u0000/g, '\n').trim();
    if (content) chunks.push({ heading, content, chunk_index: index++ });
  }
  if (chunks.length === 0) chunks.push({ heading: null, content: raw.trim(), chunk_index: 0 });
  return chunks;
}
