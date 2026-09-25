import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

const projectUrl = process.env.SUPABASE_PROJECT_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = new URL(projectUrl).hostname.split('.')[0];

const client = new pg.Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const res = await client.query('SELECT version()');
  console.log('Connected successfully.');
  console.log(res.rows[0].version);
} catch (err) {
  console.error('Connection failed:', err.message);
} finally {
  await client.end();
}
