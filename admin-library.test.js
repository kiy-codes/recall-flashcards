const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./catalog-core');
const {loadCatalog} = require('./scripts/catalog');
const {metadata,source,USER,KEY} = require('./tests/catalog-fixtures');
const env = name => ({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'never-return-server-secret'})[name];
const body = () => ({action:'publish',idempotencyKey:KEY,metadata:metadata(),deck:source()});
const request = (input, auth = true) => new Request('https://example.supabase.co/functions/v1/admin-library',{method:'POST',headers:{'content-type':'application/json',apikey:'sb_publishable_public',...(auth?{authorization:'Bearer user.jwt.token'}:{})},body:JSON.stringify(input)});
function fixture({admin = true,authStatus = 200,rpcError} = {}) {
  const calls = [], records = new Map();
  return {calls,records,fetcher:async (url,options) => {
    calls.push({url,options});
    if(url.includes('/auth/v1/user')) return Response.json({id:USER},{status:authStatus});
    if(url.includes('/recall_ai_admins')) return Response.json(admin?[{user_id:USER}]:[]);
    assert.ok(url.endsWith('/rpc/recall_publish_catalog')); assert.equal(options.headers.apikey,env('SUPABASE_SERVICE_ROLE_KEY'));
    if(rpcError) return Response.json({code:rpcError},{status:400});
    const input = JSON.parse(options.body), previous = records.get(input.p_key);
    if(previous && previous.hash!==input.p_request_hash) return Response.json({code:'P0001'},{status:400});
    if(!previous && [...records.values()].some(row=>row.content===input.p_content_hash || row.title===input.p_title)) return Response.json({code:'23505'},{status:409});
    const id=previous?.id || 'web-'+String(records.size+1).padStart(32,'0');
    if(!previous) records.set(input.p_key,{id,hash:input.p_request_hash,content:input.p_content_hash,title:input.p_title,snapshot:{...input.p_snapshot,id,file:`content/flashcard-library/remote/${id}.csv`}});
    return Response.json({id,replayed:!!previous});
  }};
}
test('server rejects signed-out, expired JWT and non-admin publishing before any write',async()=>{
  const {handleRequest}=await import('./supabase/functions/admin-library/index.ts');
  for(const [options,signedIn,status] of [[{},false,401],[{authStatus:401},true,401],[{admin:false},true,403]]) {
    const mock=fixture(options); const result=await handleRequest(request(body(),signedIn),{...mock,env}); assert.equal(result.status,status);
    assert.equal(mock.calls.some(call=>call.url.includes('/rpc/')),false);
  }
  const result=await handleRequest(request({action:'status'}),{...fixture(),env}); assert.deepEqual(await result.json(),{authorized:true});
});
test('valid admin publishes an immutable private-field-free snapshot; retries cannot create two decks',async()=>{
  const {handleRequest}=await import('./supabase/functions/admin-library/index.ts');
  const mock=fixture(), input=body(), before=structuredClone(input);
  const first=await handleRequest(request(input),{...mock,env}); assert.equal(first.status,200); const data=await first.json(); assert.equal(data.replayed,false);
  const again=await handleRequest(request(input),{...mock,env}); assert.equal((await again.json()).id,data.id); assert.equal(mock.records.size,1);
  assert.equal(mock.calls.filter(call=>call.url.includes('/auth/')).length,2);
  assert.deepEqual(input,before); assert.doesNotMatch(JSON.stringify([...mock.records.values()][0].snapshot),/private|secret|reviewCount|Mastered|fsrs|sync|folder|dueAt/);
  assert.doesNotMatch(JSON.stringify(data),/publisher|user_id|server-secret|authorization/);
  const changed=body(); changed.metadata.description='Changed description'; assert.equal((await handleRequest(request(changed),{...mock,env})).status,409);
  const duplicate={...body(),idempotencyKey:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'}; assert.equal((await handleRequest(request(duplicate),{...mock,env})).status,409); assert.equal(mock.records.size,1);
});
test('independent server validation rejects malformed, oversized, duplicate and bundled publications',async()=>{
  const {handleRequest}=await import('./supabase/functions/admin-library/index.ts');
  const variants=[{...body(),metadata:{...metadata(),qualification:'A level'}},{...body(),deck:{cards:[]}},{...body(),deck:{cards:[{front:'Q',back:'x'.repeat(701)}]}},
    {...body(),deck:{cards:[{front:'Q',back:'A',notes:'x'.repeat(2001)}]}},{...body(),deck:{cards:[{front:'Q',back:'A'},{front:'q!',back:'B'}]}},{...body(),idempotencyKey:'not-a-key'},
    {...body(),deck:{cards:Array(2001).fill({front:'Q',back:'A'})}},{...body(),deck:{cards:[{front:'Q',back:'A',private:'x'.repeat(Core.MAX_PUBLICATION_BYTES)}]}}];
  for(const input of variants) {const mock=fixture(); assert.equal((await handleRequest(request(input),{...mock,env})).status,400); assert.equal(mock.records.size,0);}
  const bundled=loadCatalog()[0];
  for(const input of [{...body(),metadata:{...metadata(),title:bundled.title}},{...body(),deck:bundled}]) assert.equal((await handleRequest(request(input),{...fixture(),env})).status,409);
});
test('database authorization races, conflicts and lost responses yield safe errors and CORS',async()=>{
  const {handleRequest}=await import('./supabase/functions/admin-library/index.ts');
  for(const [code,status] of [['42501',403],['23505',409],['23514',400],['unknown',503]]) assert.equal((await handleRequest(request(body()),{...fixture({rpcError:code}),env})).status,status);
  const mock=fixture(); const response=await handleRequest(request(body()),{env,fetcher:async(url,options)=>url.includes('/rpc/')?Promise.reject(new Error('secret')):mock.fetcher(url,options)});
  assert.equal(response.status,503); assert.match((await response.json()).error,/Retry this same/);
  const options=await handleRequest(new Request('https://example.test',{method:'OPTIONS'})); assert.equal(options.status,204); assert.equal(options.headers.get('access-control-allow-origin'),'*');
});
