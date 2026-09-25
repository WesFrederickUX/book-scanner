-- Book Scanner inventory table, replacing the Google Sheet / Apps Script backend.
--
-- Design notes:
-- - isbn/sku are TEXT, not numeric, even though the source sheet had them as
--   numbers -- the app itself always treats them as string keys (String(item.isbn)
--   everywhere), and TEXT avoids any leading-zero/precision edge cases.
-- - loose_count/boxes/box_count are nullable INTEGER, not defaulted to 0 --
--   the source data used "" (blank) to mean "never counted yet", which is a
--   real distinction from "counted as exactly zero". NULL preserves that.
-- - is_master is a real BOOLEAN, replacing the source's inconsistent
--   ""/"true"/"TRUE" string values.
-- - masters is a native Postgres TEXT[] array of ISBNs (the "part of these
--   master/bundle items" list), replacing a JSON array column.
-- - updated_at didn't exist before; added for free since it's useful to know
--   when a shelf count was last touched.

create table if not exists books (
  isbn         text primary key,
  sku          text,
  title        text not null,
  qty          integer not null default 0,
  loose_count  integer,
  boxes        integer,
  box_count    integer,
  bookcase     text,
  shelf        text,
  is_master    boolean not null default false,
  masters      text[] not null default '{}',
  updated_at   timestamptz not null default now()
);

-- Sort/search performance: title (default sort) and a case-insensitive
-- search helper across title, since that's the app's default view.
create index if not exists books_title_idx on books (title);

-- Auto-maintain updated_at on every UPDATE.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists books_set_updated_at on books;
create trigger books_set_updated_at
  before update on books
  for each row
  execute function set_updated_at();
