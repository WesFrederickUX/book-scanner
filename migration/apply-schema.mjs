import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

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

const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

await client.connect();
try {
  await client.query(sql);
  console.log('Schema applied successfully.');
} finally {
  await client.end();
}
