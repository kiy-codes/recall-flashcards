const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { library } = require('./tests/sync-fixtures');

test('Postgres enforces per-user RLS, server revisions and conditional updates without real credentials', async () => {
  const db = new PGlite();
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const third = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${first}'), ('${second}'), ('${third}');
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    const sql = fs.readFileSync(path.join(__dirname, 'supabase/schema.sql'), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // Dashboard setup is safe to rerun.
    const asUser = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec('set role authenticated');
    };
    await asUser(first);
    const inserted = await db.query('insert into public.recall_libraries (user_id, library, revision, updated_at) values ($1, $2::jsonb, 99, $3) returning *', [first, JSON.stringify(library()), '2000-01-01T00:00:00Z']);
    assert.equal(inserted.rows[0].revision, 1);
    assert.notEqual(new Date(inserted.rows[0].updated_at).getUTCFullYear(), 2000);
    await assert.rejects(db.query('insert into public.recall_libraries (user_id, library) values ($1, $2::jsonb)', [second, JSON.stringify(library())]), { code: '42501' });
    await asUser(second);
    assert.equal((await db.query('select * from public.recall_libraries')).rows.length, 0);
    await db.query('insert into public.recall_libraries (user_id, library) values ($1, $2::jsonb)', [second, JSON.stringify(library())]);
    await asUser(first);
    assert.equal((await db.query('select user_id from public.recall_libraries')).rows[0].user_id, first);
    assert.equal((await db.query('update public.recall_libraries set library = library where user_id = $1 returning *', [second])).rows.length, 0);
    assert.equal((await db.query('delete from public.recall_libraries where user_id = $1 returning *', [second])).rows.length, 0);
    await assert.rejects(db.query('update public.recall_libraries set user_id = $1 where user_id = $2', [third, first]), { code: '42501' });
    const updated = await db.query('update public.recall_libraries set library = library where user_id = $1 and revision = 1 returning revision', [first]);
    assert.equal(updated.rows[0].revision, 2);
    assert.equal((await db.query('update public.recall_libraries set library = library where user_id = $1 and revision = 1 returning revision', [first])).rows.length, 0);
    await assert.rejects(db.query('update public.recall_libraries set library = $1::jsonb where user_id = $2', ['{}', first]), { code: '23514' });
    assert.equal((await db.query('delete from public.recall_libraries where user_id = $1 returning user_id', [first])).rows.length, 1);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.recall_libraries'), { code: '42501' });
  } finally { await db.close(); }
});
