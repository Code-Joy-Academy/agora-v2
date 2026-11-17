import { pool } from './pool.js';

// Usage: npm run admin:grant -- someone@school.example
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error('Usage: npm run admin:grant -- <email>');

const { rowCount } = await pool.query(
    `INSERT INTO institution_admins (user_id, institution_id)
   SELECT id, institution_id FROM users WHERE lower(email) = $1
   ON CONFLICT DO NOTHING`,
    [email],
);

//This console.log needs to be a systems log
console.log(rowCount ? `Granted institution admin to ${email}` : `No new grant (unknown email or already an admin): ${email}`);
await pool.end();
