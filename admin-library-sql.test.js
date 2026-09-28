const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
const {createHash} = require('node:crypto');
const Core = require('./catalog-core');
const {metadata,source,USER,KEY} = require('./tests/catalog-fixtures');
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
test('database public columns, immutable snapshots, admin-only RPC, validation and idempotency',async()=>{
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${USER}'),('${OTHER}');
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated;`);
    const sql=fs.readFileSync('supabase/schema.sql','utf8'), migration=fs.readFileSync('supabase/migrations/202609280001_public_catalog.sql','utf8');
    assert.ok(sql.replace(/\r/g,'').endsWith(migration.replace(/\r/g,'')));
    await db.exec(sql); await db.exec(migration);
    await db.query('insert into public.recall_ai_admins(user_id) values($1)',[USER]);
    const clean=Core.preparePublication(metadata(),source()), snapshot=Core.publicationEntry(clean);
    const sha=text=>createHash('sha256').update(text).digest('hex');
    const args=[USER,KEY,sha(JSON.stringify(clean)),Core.normalizeText(metadata().title).replace(/\s/g,''),sha(Core.contentKey(clean.deck)),JSON.stringify(snapshot)];
    const publish=values=>db.query('select public.recall_publish_catalog($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb) as result',values||args);
    await db.exec('set role service_role');
    await assert.rejects(publish([OTHER,...args.slice(1)]),{code:'42501'});
    const first=(await publish()).rows[0].result; assert.equal(first.replayed,false); assert.match(first.id,/^web-[a-f0-9]{32}$/);
    assert.deepEqual((await publish()).rows[0].result,{id:first.id,replayed:true});
    await assert.rejects(publish([USER,KEY,'c'.repeat(64),...args.slice(3)]),/Retry key/);
    await assert.rejects(publish([USER,OTHER,...args.slice(2)]),/duplicate/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*) from public.recall_catalog_decks')).rows[0].count,1);
    const internal=(await db.query('select * from public.recall_catalog_decks')).rows[0]; assert.equal(internal.publisher_id,USER); assert.ok(internal.created_at);
    assert.doesNotMatch(JSON.stringify(internal.snapshot),/private|secret|fsrs|Mastered|reviewHistory|sync|folder/);
    await assert.rejects(db.query('update public.recall_catalog_decks set snapshot=snapshot'),/immutable/);
    await assert.rejects(db.query('delete from public.recall_catalog_decks'),/immutable/);
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      assert.equal((await db.query('select id,snapshot from public.recall_catalog_decks')).rows.length,1);
      await assert.rejects(db.query('select * from public.recall_catalog_decks'),{code:'42501'});
      await assert.rejects(db.query('select publisher_id from public.recall_catalog_decks'),{code:'42501'});
      await assert.rejects(publish(),{code:'42501'});
      await assert.rejects(db.query("insert into public.recall_catalog_decks(id) values('web-' || repeat('a',32))"),{code:'42501'});
      await assert.rejects(db.query('update public.recall_catalog_decks set published=false'),{code:'42501'});
      await assert.rejects(db.query('delete from public.recall_catalog_decks'),{code:'42501'});
      await db.exec('reset role');
    }
    // An unpublished internal row cannot be read publicly, even with a known ID.
    const hiddenId='web-'+ 'b'.repeat(32);
    const hidden={...internal.snapshot,id:hiddenId,file:`content/flashcard-library/remote/${hiddenId}.csv`};
    await db.query('insert into public.recall_catalog_decks(id,snapshot,published,publisher_id,idempotency_key,request_hash,normalized_title,content_hash) values($1,$2::jsonb,false,$3,$4,$5,$6,$7)',[hiddenId,JSON.stringify(hidden),USER,OTHER,'d'.repeat(64),'hidden-title','e'.repeat(64)]);
    await db.exec('set role anon'); assert.equal((await db.query('select id,snapshot from public.recall_catalog_decks')).rows.length,1); await db.exec('reset role');
    for(const bad of [{...internal.snapshot,private:'secret'},{...internal.snapshot,cards:[{...internal.snapshot.cards[0],fsrs:{}}]},
      {...internal.snapshot,qualification:'A level'},{...internal.snapshot,cards:[{...internal.snapshot.cards[0],front:'x'.repeat(701)}]},
      {...internal.snapshot,cards:[{...internal.snapshot.cards[0],acceptedAnswers:Array(31).fill('A')}]}, {...internal.snapshot,cardCount:2001}]) {
      assert.equal((await db.query('select public.recall_catalog_snapshot_valid($1::jsonb) as valid',[JSON.stringify(bad)])).rows[0].valid,false);
    }
    await db.query('delete from public.recall_ai_admins where user_id=$1',[USER]); await db.exec('set role service_role');
    await assert.rejects(publish(),{code:'42501'});
  } finally {await db.close();}
});
