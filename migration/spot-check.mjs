import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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

await client.connect();
try {
  const { rows: sample } = await client.query('select * from books order by random() limit 5');
  console.log('Random sample of 5 rows:');
  console.log(JSON.stringify(sample, null, 2));

  const { rows: masterRows } = await client.query("select isbn, title, is_master, masters from books where is_master = true or array_length(masters, 1) > 0");
  console.log('\nAll master-item / bundle-tagged rows:');
  console.log(JSON.stringify(masterRows, null, 2));

  const { rows: counted } = await client.query("select count(*) from books where loose_count is not null or boxes is not null");
  console.log(`\nRows with actual physical count data entered: ${counted[0].count}`);
} finally {
  await client.end();
}
