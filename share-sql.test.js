const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const Share = require('./share-core');

test('Postgres share RLS and bearer-token preview protect owner data', async () => {
  const db = new PGlite();
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const token = 'a'.repeat(64);
  const hash = createHash('sha256').update(token).digest('hex');
  const deck = Share.snapshotDeck({ name: 'Shared Biology', subject: 'Science', domain: 'science', tags: ['Cells'], cards: [{ front: 'Cell', back: 'Unit of life', notes: 'secret', dueAt: 'tomorrow' }] });
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${first}'), ('${second}');
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    const sql = fs.readFileSync(path.join(__dirname, 'supabase/schema.sql'), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const asUser = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec('set role authenticated');
    };
    await asUser(first);
    const inserted = await db.query('insert into public.recall_deck_shares (owner_id, deck_id, token_hash, deck, expires_at) values ($1,$2,$3,$4::jsonb,clock_timestamp() + interval \'7 days\') returning id', [first, 'deck-1', hash, JSON.stringify(deck)]);
    const id = inserted.rows[0].id;
    await assert.rejects(db.query('insert into public.recall_deck_shares (owner_id, deck_id, token_hash, deck, expires_at) values ($1,$2,$3,$4::jsonb,clock_timestamp() + interval \'7 days\')', [second, 'deck-2', 'b'.repeat(64), JSON.stringify(deck)]), { code: '42501' });
    const badDeck = { ...deck, privateNotes: 'secret' };
    await assert.rejects(db.query('insert into public.recall_deck_shares (owner_id, deck_id, token_hash, deck, expires_at) values ($1,$2,$3,$4::jsonb,clock_timestamp() + interval \'7 days\')', [first, 'deck-3', 'c'.repeat(64), JSON.stringify(badDeck)]), { code: '23514' });
    const badCard = { ...deck, cards: [{ ...deck.cards[0], notes: 'secret' }] };
    await assert.rejects(db.query('insert into public.recall_deck_shares (owner_id, deck_id, token_hash, deck, expires_at) values ($1,$2,$3,$4::jsonb,clock_timestamp() + interval \'7 days\')', [first, 'deck-4', 'f'.repeat(64), JSON.stringify(badCard)]), { code: '23514' });
    await asUser(second);
    assert.equal((await db.query('select * from public.recall_deck_shares')).rows.length, 0);
    assert.equal((await db.query('update public.recall_deck_shares set revoked_at=clock_timestamp() where id=$1 returning id', [id])).rows.length, 0);
    assert.equal((await db.query('delete from public.recall_deck_shares where id=$1 returning id', [id])).rows.length, 0);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.recall_deck_shares'), { code: '42501' });
    const preview = await db.query('select public.recall_preview_deck_share($1) as deck', [token]);
    assert.deepEqual(preview.rows[0].deck, deck);
    assert.equal(JSON.stringify(preview.rows[0]).includes('secret'), false);
    assert.equal((await db.query('select public.recall_preview_deck_share($1) as deck', ['invalid'])).rows[0].deck, null);
    await asUser(first);
    await db.query('update public.recall_deck_shares set revoked_at=clock_timestamp() where id=$1', [id]);
    await assert.rejects(db.query('update public.recall_deck_shares set revoked_at=null where id=$1', [id]), /cannot be reactivated/);
    await db.exec('reset role; set role anon;');
    assert.equal((await db.query('select public.recall_preview_deck_share($1) as deck', [token])).rows[0].deck, null);
    await asUser(first);
    const expiredToken = 'd'.repeat(64);
    await db.query('insert into public.recall_deck_shares (owner_id, deck_id, token_hash, deck, created_at, expires_at) values ($1,$2,$3,$4::jsonb,$5,$6)', [first, 'old-deck', createHash('sha256').update(expiredToken).digest('hex'), JSON.stringify(deck), '2000-01-01T00:00:00Z', '2001-01-01T00:00:00Z']);
    const deletedToken = 'e'.repeat(64);
    const deleted = await db.query('insert into public.recall_deck_shares (owner_id, deck_id, token_hash, deck, expires_at) values ($1,$2,$3,$4::jsonb,clock_timestamp() + interval \'7 days\') returning id', [first, 'soon-deleted', createHash('sha256').update(deletedToken).digest('hex'), JSON.stringify(deck)]);
    await db.query('delete from public.recall_deck_shares where id=$1', [deleted.rows[0].id]);
    await db.exec('reset role; set role anon;');
    assert.equal((await db.query('select public.recall_preview_deck_share($1) as deck', [expiredToken])).rows[0].deck, null);
    assert.equal((await db.query('select public.recall_preview_deck_share($1) as deck', [deletedToken])).rows[0].deck, null);
  } finally { await db.close(); }
});
