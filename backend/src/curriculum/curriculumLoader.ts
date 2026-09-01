import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';
import { cambridgeStage8English } from './packs/cambridgeStage8English.js';
import { cambridgeStage9Math} from './packs/cambridgeStage9Math.js';
import type { CurriculumPack } from './types.js';

export const AVAILABLE_PACKS: CurriculumPack[] = [cambridgeStage8English, cambridgeStage9Math];

export async function loadPack(pack: CurriculumPack) {
  for (const node of pack.nodes) {
    const exists = await pool.query('SELECT id FROM curriculum_nodes WHERE id = $1', [node.id]);
    if (exists.rows[0]) continue;

    await pool.query(
      `INSERT INTO curriculum_nodes (id, pack_id, strand, title, description, sample_passage, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [node.id, pack.pack_id, node.strand, node.title, node.description, node.sample_passage, node.order_index]
    );
    await pool.query(
      `INSERT INTO node_questions (id, node_id, prompt, misconception_triggers) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), node.id, node.question, JSON.stringify(node.misconception_triggers)]
    );
  }
}

export async function loadAllPacks() {
  for (const pack of AVAILABLE_PACKS) await loadPack(pack);
  console.log(`seeded ${AVAILABLE_PACKS.length} curriculum packs (${AVAILABLE_PACKS.reduce((n, p) => n + p.nodes.length, 0)} nodes)`);
}

if (process.argv[1]?.endsWith('curriculumLoader.ts') || process.argv[1]?.endsWith('curriculumLoader.js')) {
  await loadAllPacks();
  await pool.end();
}
