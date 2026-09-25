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

function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  return v === true || v === 'true' || v === 'TRUE';
}

// Rows from the source Sheet with a blank ISBN column -- the Apps Script
// ?action=all feed silently drops these, so neither the old app nor the
// original migration ever saw them. Since the app's whole data model keys
// on isbn (primary key, scan target, cache key), and the user wants to
// avoid a primary-key change, these use their SKU as the isbn value
// instead so they're at least visible/searchable/editable. Confirmed no
// collisions with existing isbn values and no duplicate/blank SKUs among
// them before running this. They can't be found via camera scan (no real
// barcode exists) -- only via manual entry (typing the SKU) or search.
const rows = JSON.parse(readFileSync(join(__dirname, 'no_isbn_rows.json'), 'utf-8'));

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
  let inserted = 0;
  for (const item of rows) {
    const masters = item.masters ? item.masters.split(',').map(s => s.trim()).filter(Boolean) : [];
    await client.query(
      `insert into books (isbn, sku, title, qty, loose_count, boxes, box_count, bookcase, shelf, is_master, masters)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (isbn) do update set
         sku = excluded.sku, title = excluded.title, qty = excluded.qty,
         loose_count = excluded.loose_count, boxes = excluded.boxes, box_count = excluded.box_count,
         bookcase = excluded.bookcase, shelf = excluded.shelf, is_master = excluded.is_master, masters = excluded.masters`,
      [
        item.sku, item.sku, item.title,
        Number(item.qty) || 0,
        toIntOrNull(item.looseCount), toIntOrNull(item.boxes), toIntOrNull(item.boxCount),
        item.bookcase || null,
        item.shelf || null,
        toBool(item.isMaster),
        masters
      ]
    );
    inserted++;
  }
  console.log(`Inserted/updated ${inserted} no-ISBN rows (keyed by SKU).`);

  const countRes = await client.query('select count(*) from books');
  console.log(`Total rows in Supabase now: ${countRes.rows[0].count}`);
} finally {
  await client.end();
}
