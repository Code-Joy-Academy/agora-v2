
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, lockPool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../db/migrations');

const rollback = process.argv.includes('--rollback');

const closePools = async () => {
    await Promise.all([pool.end(), lockPool.end()]);
};

try {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);

    const files = (await readdir(migrationsDir))
        .filter((name) => /^\d+.*\.sql$/.test(name) && !name.endsWith('.down.sql'))
        .sort();

    if (rollback) {
        // Roll back the most recently applied migration.
        const { rows } = await pool.query(`
            SELECT filename
            FROM schema_migrations
            ORDER BY applied_at DESC, filename DESC
            LIMIT 1
        `);

        if (!rows.length) {
            console.log('No migrations to rollback');
        } else {
            const filename = rows[0].filename;
            const downFilename = filename.replace(/\.sql$/, '.down.sql');
            const downPath = path.join(migrationsDir, downFilename);

            const sql = await readFile(downPath, 'utf8');
            const client = await pool.connect();

            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'DELETE FROM schema_migrations WHERE filename=$1',
                    [filename]
                );
                await client.query('COMMIT');

                console.log(`rolled back ${filename}`);
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }
        }
    } else {
        for (const filename of files) {
            const { rows } = await pool.query(
                'SELECT 1 FROM schema_migrations WHERE filename=$1',
                [filename]
            );

            if (rows[0]) {
                console.log(`skip ${filename}`);
                continue;
            }

            const sql = await readFile(
                path.join(migrationsDir, filename),
                'utf8'
            );

            const client = await pool.connect();

            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations(filename) VALUES($1)',
                    [filename]
                );
                await client.query('COMMIT');

                console.log(`applied ${filename}`);
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }
        }
    }
} finally {
    await closePools();
}
