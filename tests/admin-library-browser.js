(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const until = async predicate => { for (let i=0;i<300;i++) { if(predicate()) return; await new Promise(resolve=>setTimeout(resolve,10)); } throw new Error('Timed out waiting for library UI'); };
  const el = id => document.getElementById(id);
  const click = id => { assert(el(id), 'Missing '+id); el(id).click(); };
  const input = (id,value) => { const node=el(id); if(node.type==='checkbox') node.checked=value; else node.value=value; node.dispatchEvent(new Event('input',{bubbles:true})); };
  const fixture=window.publicationFixtures, meta=fixture.metadata, raw=fixture.source;
  raw.subject=meta.subject;
  state.sets=[normaliseDeck(raw), normaliseDeck({id:'empty-personal',name:'Different Biology',subject:'Biology',cards:[]})];
  state.activeSetId=state.sets[0].id; save();
  const original=JSON.stringify(RecallLibrary.catalogSources()), stored=localStorage.getItem(STORAGE_KEY);
  let session=null, admin=false, authCallback, pending, outcome='success', remoteFailure=false, remoteRows=[];
  const requests=[], records=new Map();
  const client={
    auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session?.user}}),onAuthStateChange:callback=>{authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};}},
    functions:{invoke:async(name,{body})=>{
      assert(name==='admin-library','Wrong endpoint');
      if(body.action==='status') return admin?{data:{authorized:true}}:{data:{error:'Admin access required.'}};
      requests.push(structuredClone(body));
      if(outcome==='pending') await new Promise(resolve=>{pending=resolve;});
      let result=records.get(body.idempotencyKey);
      const replayed=!!result;
      if(!result){ const id='web-'+String(records.size+1).padStart(32,'0'); result={id,title:body.metadata.title,cardCount:body.deck.cards.length,version:body.metadata.version}; records.set(body.idempotencyKey,result);
        remoteRows.push({id,snapshot:RecallCatalogCore.publicationEntry(body,id)}); }
      if(outcome==='timeout') return {error:new Error('Network response lost')};
      return {data:{...result,replayed}};
    }},
    from:name=>{ assert(name==='recall_catalog_decks','Private table used for public catalogue');return {select(fields){assert(fields==='id,snapshot','Publisher identity requested');return this;},order(){return this;},range(){return this;},abortSignal:async()=>remoteFailure?{error:{}}:{data:structuredClone(remoteRows)}};},
  };
  const factory={enabled:true,create:()=>client};
  const mounted=RecallAdminLibrary.mount({factory});
  await mounted.refreshAccess(); assert(el('adminLibraryLauncher').hidden,'Signed-out launcher visible');
  session={user:{id:fixture.USER}};
  await mounted.refreshAccess(); assert(el('adminLibraryLauncher').hidden,'Ordinary user launcher visible');
  admin=true; await mounted.refreshAccess(); assert(!el('adminLibraryLauncher').hidden,'Admin launcher missing');
  click('adminLibraryLauncher'); assert(el('adminLibraryDialog').open,'Wizard did not open');
  assert(el('adminLibraryDecks').children.length===2,'Own decks missing');
  input('adminLibrarySearch','Physics'); assert(el('adminLibraryDecks').children.length===1,'Subject search failed');
  assert(el('adminLibraryDecks').textContent.includes('1 cards'),'Card count missing');
  document.querySelector('[data-source-id="private-deck"]').click();
  assert(el('adminLibrary-version').value==='1.0.0','Initial semantic version wrong');
  assert(el('adminLibrary-qualification').value==='','Unsafe qualification was prefilled');
  for(const [key,value] of Object.entries(meta)) { if(key==='verified') el('adminLibrary-'+key).value=String(value);else input('adminLibrary-'+key,value); }
  el('adminLibraryMetadata').requestSubmit();
  assert(el('adminLibraryPreviewCards').textContent.includes('Public note'),'Notes absent from preview');
  assert(el('adminLibraryPreviewCards').textContent.includes('Plasma sphere'),'Alternatives absent from preview');
  assert(requests.length===0,'Preview made a publication request');
  click('adminLibraryConfirmNext');
  assert(el('adminLibraryPublish').disabled,'Publish enabled with no confirmations');
  // Each requirement independently gates publication.
  for(const [review,privateChecked,title] of [[true,false,meta.title],[false,true,meta.title],[true,true,meta.title+' '],[true,true,meta.title.toUpperCase()]]) {
    input('adminLibraryReviewed',review);input('adminLibraryPrivacy',privateChecked);input('adminLibraryTypedTitle',title);
    assert(el('adminLibraryPublish').disabled,'Incomplete confirmation enabled publication'); click('adminLibraryPublish'); assert(requests.length===0,'Incomplete confirmation sent request');
  }
  click('adminLibraryCancel'); assert(!el('adminLibraryConfirm').open && requests.length===0,'Cancel published');
  click('adminLibraryConfirmNext'); el('adminLibraryConfirm').close(); assert(requests.length===0,'Closing confirmation published');
  click('adminLibraryConfirmNext');
  const complete=()=>{input('adminLibraryReviewed',true);input('adminLibraryPrivacy',true);input('adminLibraryTypedTitle',meta.title);};
  complete(); assert(!el('adminLibraryPublish').disabled,'Complete confirmation remains disabled');
  outcome='pending'; click('adminLibraryPublish'); click('adminLibraryPublish');
  await until(()=>requests.length===1 && pending);
  assert(el('adminLibraryPublish').disabled,'Pending button enabled');
  const event=new Event('cancel',{cancelable:true}); el('adminLibraryConfirm').dispatchEvent(event); assert(event.defaultPrevented,'Escape can dismiss pending request');
  outcome='timeout'; pending();
  await until(()=>el('adminLibraryConfirmMessage').textContent.includes('Retry this same'));
  assert(records.size===1,'Simulated committed timeout did not store one deck');
  outcome='success'; click('adminLibraryPublish');click('adminLibraryPublish');
  await until(()=>el('adminLibraryMessage').textContent.includes('Published'));
  assert(requests.length===2 && records.size===1,'Retry created duplicate decks');
  assert(requests[0].idempotencyKey===requests[1].idempotencyKey,'Retry changed idempotency key');
  assert(el('adminLibraryMessage').textContent.includes('no second copy'),'Retry success unclear');
  assert(!/private-card|folderId|reviewCount|fsrs|sync|Mastered/.test(JSON.stringify(requests[0])),'Private fields sent');
  assert(original===JSON.stringify(RecallLibrary.catalogSources()),'Publication modified source decks');
  assert(stored===localStorage.getItem(STORAGE_KEY),'Publication wrote personal library storage');
  click('adminLibraryClose');
  // Remote loading and copying use the same public catalogue UI on desktop/mobile.
  window.RecallCloudClient=factory;
  remoteFailure=true; click('browseCatalogBtn');
  await until(()=>el('catalogRemoteStatus').textContent.includes('unavailable'));
  assert(document.querySelectorAll('[data-catalog-id]').length===RecallCatalogData.entries.length,'Failure cleared bundled catalogue');
  click('catalogClose');remoteFailure=false;click('browseCatalogBtn');
  await until(()=>document.querySelectorAll('[data-catalog-id]').length===RecallCatalogData.entries.length+1);
  assert(el('catalogQualification').querySelector('option[value="GCSE"]'),'Existing filters missing');
  const remote=remoteRows[0]; document.querySelector('[data-catalog-id="'+remote.id+'"]').click();
  assert(el('catalogPreviewTitle').textContent===meta.title,'Remote preview failed');click('catalogAdd');
  const copy=state.sets.at(-1); assert(copy.name===meta.title && copy.cards[0].state==='New','Remote copy not fresh');
  assert(copy.id!==raw.id && copy.cards[0].id!==raw.cards[0].id,'Remote copy retained source IDs');
  copy.cards[0].notes='My local edit';assert(remoteRows[0].snapshot.cards[0].notes==='Public note','Copy changed public snapshot');
  // Markup is rendered as text, not interpreted as HTML.
  remoteRows[0].snapshot.title='<img src=x onerror=alert(1)>';
  click('browseCatalogBtn');await until(()=>el('catalogGrid').textContent.includes('<img'));
  assert(!el('catalogGrid').querySelector('img'),'Deck text interpreted as markup');
  assert(!el('catalogLibrary').querySelector('script'),'Injected deck script'); click('catalogClose');
  click('adminLibraryLauncher');
  const rect=el('adminLibraryDialog').getBoundingClientRect();
  assert(rect.left>=0 && rect.right<=innerWidth+1,'Admin dialog overflows viewport');
  assert(el('adminLibraryDialog').scrollWidth<=el('adminLibraryDialog').clientWidth+1,'Admin dialog horizontal overflow');
  session=null;authCallback('SIGNED_OUT');await until(()=>el('adminLibraryLauncher').hidden);
  assert(!el('adminLibraryDialog').open,'Sign-out left admin wizard open');
  mounted.destroy();
  return 'Admin visibility, confirmations, cancel, double-click, lost-response retry, privacy, remote/offline catalogue and fresh copying passed.';
})()
