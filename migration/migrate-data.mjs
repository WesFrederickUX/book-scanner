import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby35cKeHOZhbmW-v1AiVceQArzPhStrfa3XG_5kfVubYWYCYv9gMPprFiM2-zrcvphm/exec';

const projectUrl = process.env.SUPABASE_PROJECT_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = new URL(projectUrl).hostname.split('.')[0];

function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  return v === true || v === 'true' || v === 'TRUE';
}

console.log('Fetching live data from the Google Sheet (via Apps Script)...');
const res = await fetch(`${SCRIPT_URL}?action=all&t=${Date.now()}`);
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const data = await res.json();
const items = data.items || [];
console.log(`Fetched ${items.length} items.`);

// De-dupe by ISBN, keeping the LAST occurrence -- matches the app's own
// in-memory behavior (db[String(item.isbn)] = item overwrites earlier ones).
const byIsbn = new Map();
for (const item of items) {
  byIsbn.set(String(item.isbn), item);
}
const rows = Array.from(byIsbn.values());
console.log(`${rows.length} unique ISBNs after de-duping (${items.length - rows.length} duplicates collapsed).`);

const client = new pg.Client({
  host: `db.${projectRef}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const BATCH_SIZE = 500;
let inserted = 0;

try {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    let p = 1;

    for (const item of batch) {
      const masters = Array.isArray(item.masters) ? item.masters.map(String) : [];
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(
        String(item.isbn),
        item.sku !== undefined && item.sku !== null ? String(item.sku) : null,
        item.title || '',
        Number(item.qty) || 0,
        toIntOrNull(item.looseCount),
        toIntOrNull(item.boxes),
        toIntOrNull(item.boxCount),
        item.bookcase || null,
        item.shelf !== undefined && item.shelf !== null && item.shelf !== '' ? String(item.shelf) : null,
        toBool(item.isMaster),
        masters
      );
    }

    const sql = `
      insert into books (isbn, sku, title, qty, loose_count, boxes, box_count, bookcase, shelf, is_master, masters)
      values ${values.join(',')}
      on conflict (isbn) do update set
        sku = excluded.sku,
        title = excluded.title,
        qty = excluded.qty,
        loose_count = excluded.loose_count,
        boxes = excluded.boxes,
        box_count = excluded.box_count,
        bookcase = excluded.bookcase,
        shelf = excluded.shelf,
        is_master = excluded.is_master,
        masters = excluded.masters
    `;
    await client.query(sql, params);
    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted} / ${rows.length}...`);
  }
  console.log('\nMigration complete.');

  const countRes = await client.query('select count(*) from books');
  console.log(`Verified row count in Supabase: ${countRes.rows[0].count}`);
} finally {
  await client.end();
}
