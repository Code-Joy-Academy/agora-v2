import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { pool } from './pool.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(dir, 'schema.sql'), 'utf-8');

await pool.query(sql);
console.log('schema applied');
await pool.end();
