(function () {
  'use strict';
  const Core = window.RecallSyncCore;
  const Sync = window.RecallSyncService;
  let disposePrevious;
  function mount({ factory = window.RecallCloudClient, local = window.RecallLibrary, storage = window.localStorage, reload = () => location.reload() } = {}) {
    disposePrevious?.();
    const dialog = document.createElement('dialog');
    dialog.id = 'accountDialog'; dialog.className = 'account-dialog';
    dialog.setAttribute('aria-labelledby', 'accountHeading');
    dialog.innerHTML = `
      <header class="account-head"><div><p class="eyebrow">Your library, your devices</p><h2 id="accountHeading">Account &amp; sync</h2></div><button id="accountClose" class="text-button" type="button" aria-label="Close account and sync">Close</button></header>
      <p id="accountIdentity">Signed out</p>
      <p class="account-help">Studying and editing always work on this device. Cloud uploads and downloads happen only when you choose them.</p>
      <p id="accountOffline" class="account-notice" hidden>You are offline. Your local library is available; cloud requests need a connection.</p>
      <p id="accountSetup" class="account-notice" hidden>Cloud accounts are not configured in this build. You can study and keep local backup files.</p>
      <form id="accountAuthForm">
        <label>Email<input id="accountEmail" type="email" autocomplete="email" required maxlength="254" /></label>
        <label>Password<input id="accountPassword" type="password" autocomplete="current-password" required minlength="6" /></label>
        <div class="account-actions"><button id="accountSignIn" class="primary-button" type="submit" value="signin">Sign in</button><button id="accountSignUp" class="text-button" type="submit" value="signup">Sign up</button></div>
      </form>
      <div id="accountSignedIn" hidden>
        <div class="account-actions"><button id="accountUpload" class="primary-button" type="button">Upload local library</button><button id="accountDownload" class="text-button" type="button">Download cloud library</button><button id="accountSignOut" class="text-button" type="button">Sign out</button></div>
        <p class="account-help">This device’s library stays here when you sign out. Upload only to the account you intend to use.</p>
      </div>
      <p id="accountStatus" role="status" aria-live="polite">Local library ready.</p>
      <p id="accountError" class="account-error" role="alert" hidden></p>
      <p id="accountWarning" class="account-notice" hidden></p>
      <p id="accountLastSync" class="account-help">Last sync: never on this device</p>
      <section id="accountChoice" class="account-choice" aria-labelledby="accountChoiceHeading" hidden>
        <h3 id="accountChoiceHeading">Choose your library</h3>
        <p id="accountComparison"></p><p id="accountConflict" class="account-notice" hidden>Cloud changed since the last sync on this device.</p>
        <p id="accountChoiceHelp" class="account-help"></p>
        <div class="account-actions"><button id="accountKeepLocal" class="text-button" type="button">Keep local</button><button id="accountUseCloud" class="text-button" type="button">Use cloud</button><button id="accountMerge" class="text-button" type="button">Merge when safe</button><button id="accountCancelSync" class="text-button" type="button">Cancel</button></div>
        <p id="accountMergeHelp" class="account-help"></p><button id="accountExportCloud" class="text-button" type="button">Export cloud copy</button>
      </section>
      <section id="accountRestore" class="account-choice" hidden><h3>Restore a backup file?</h3><p id="accountRestoreSummary"></p><p class="account-help">This replaces this device’s library and saves its current contents as a recovery copy. Cloud is not changed.</p><div class="account-actions"><button id="accountConfirmRestore" class="primary-button" type="button">Use backup</button><button id="accountCancelRestore" class="text-button" type="button">Keep local / cancel</button></div></section>
      <footer class="account-backups"><h3>Local backup files</h3><p class="account-help">Save the complete library, including progress, history and settings. Deck CSV, TSV and share exports are also available in Library.</p><div class="account-actions"><button id="accountExport" class="text-button" type="button">Export full backup</button><button id="accountImport" class="text-button" type="button">Import full backup</button><button id="accountRecovery" class="text-button" type="button" hidden>Export previous local copy</button></div><input id="accountBackupFile" type="file" accept=".json,application/json" hidden /></footer>`;
    document.body.append(dialog);
    const el = id => dialog.querySelector('#' + id);
    const trigger = document.querySelector('#accountBtn');
    let service, pending = null, restoration = null, current = { session: null, busy: false, status: 'Local library ready.', error: '', warning: '', lastSync: null };
    let enabled = Boolean(factory?.enabled);
    const notice = (id, text) => { el(id).textContent = text || ''; el(id).hidden = !text; };
    function render(next = current) {
      current = next;
      const signedIn = Boolean(next.session?.user);
      if (pending && pending.userId !== next.session?.user?.id) pending = null;
      el('accountIdentity').textContent = signedIn ? 'Signed in as ' + next.session.user.email : 'Signed out';
      trigger.textContent = signedIn ? 'Account: ' + next.session.user.email : 'Account & sync';
      trigger.title = trigger.textContent;
      el('accountSetup').hidden = enabled;
      el('accountAuthForm').hidden = !enabled || signedIn;
      el('accountSignedIn').hidden = !signedIn;
      el('accountOffline').hidden = navigator.onLine;
      el('accountStatus').textContent = next.status;
      notice('accountError', next.error); notice('accountWarning', next.warning);
      el('accountLastSync').textContent = 'Last sync: ' + (next.lastSync ? new Date(next.lastSync).toLocaleString() : 'never on this device');
      dialog.querySelectorAll('button, input').forEach(node => { node.disabled = next.busy; });
      el('accountChoice').hidden = !pending;
      el('accountRestore').hidden = !restoration;
      for (const id of ['accountUpload', 'accountDownload', 'accountImport']) el(id).disabled = next.busy || Boolean(pending || restoration);
      if (pending) {
        const describe = value => { const counts = Core.summary(value); return `${counts.decks} decks, ${counts.cards} cards, ${counts.folders} folders`; };
        el('accountComparison').textContent = 'This device: ' + describe(pending.local) + '. Cloud: ' + (pending.cloud ? describe(pending.cloud.library) + ` (revision ${pending.cloud.revision}, ${new Date(pending.cloud.updated_at).toLocaleString()}).` : 'no backup yet.');
        el('accountConflict').hidden = !pending.conflict;
        el('accountChoiceHelp').textContent = pending.direction === 'upload' ? 'Keep local uploads this device’s library and replaces the cloud copy. Use cloud replaces this device’s library. Merge saves the combined library to both.' : 'Keep local skips this download. Use cloud replaces this device’s library. Merge combines the libraries on this device; upload afterwards to update cloud.';
        el('accountMerge').disabled = next.busy || !pending.merge.safe;
        el('accountUseCloud').disabled = next.busy || !pending.cloud;
        el('accountExportCloud').disabled = next.busy || !pending.cloud;
        el('accountMergeHelp').textContent = pending.merge.safe ? 'A safe merge is available. This device’s study preferences are kept.' : pending.cloud ? 'Merge is unavailable because changes overlap or there is no shared history to resolve them safely. Export both copies before choosing if you need to preserve both.' : 'Choose Keep local to create your first cloud backup.';
      }
      try { el('accountRecovery').hidden = !storage.getItem(Core.RECOVERY_KEY); } catch { el('accountRecovery').hidden = true; }
    }
    async function run(action) {
      try { await action(); }
      catch (error) { notice('accountError', error instanceof Sync.SyncError ? error.message : Sync.friendlyError(error)); }
    }
    function download(library, filename) {
      const payload = { format: 'recall-library-backup-v1', exportedAt: new Date().toISOString(), library };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const open = () => { render(); dialog.showModal(); };
    trigger.addEventListener('click', open);
    el('accountClose').onclick = () => { pending = null; restoration = null; dialog.close(); };
    dialog.addEventListener('cancel', event => { if (current.busy) event.preventDefault(); else { pending = null; restoration = null; } });
    // Keep global study shortcuts from marking cards while the modal is open.
    const keydown = event => { if (dialog.open) event.stopPropagation(); };
    document.addEventListener('keydown', keydown, true);
    el('accountAuthForm').onsubmit = event => {
      event.preventDefault();
      const mode = event.submitter?.value || 'signin';
      const email = el('accountEmail').value, password = el('accountPassword').value;
      el('accountPassword').value = '';
      run(() => service.authenticate(mode, email, password));
    };
    el('accountSignOut').onclick = () => run(async () => { pending = null; await service.signOut(); });
    for (const [id, direction] of [['accountUpload', 'upload'], ['accountDownload', 'download']]) el(id).onclick = () => run(async () => {
      const plan = await service.prepare(direction); pending = plan.identical ? null : plan; render();
    });
    for (const [id, choice] of [['accountKeepLocal', 'local'], ['accountUseCloud', 'cloud'], ['accountMerge', 'merge'], ['accountCancelSync', 'cancel']]) el(id).onclick = () => run(async () => {
      const plan = pending;
      try { const result = await service.resolve(plan, choice); if (result.localChanged) reload(); }
      finally { pending = null; render(); }
    });
    el('accountExport').onclick = () => run(async () => download(local.read(), 'recall-full-backup.json'));
    el('accountExportCloud').onclick = () => run(async () => download(pending.cloud.library, 'recall-cloud-backup.json'));
    el('accountRecovery').onclick = () => run(async () => {
      const recovery = JSON.parse(storage.getItem(Core.RECOVERY_KEY));
      if (!recovery?.library) throw new Sync.SyncError('no_recovery', 'No previous local copy is available.');
      download(recovery.library, 'recall-before-cloud-backup.json');
    });
    el('accountImport').onclick = () => el('accountBackupFile').click();
    el('accountBackupFile').onchange = () => run(async () => {
      const file = el('accountBackupFile').files[0]; el('accountBackupFile').value = '';
      if (!file) return;
      if (file.size > Core.MAX_BYTES * 3) throw new Sync.SyncError('large_backup', 'This backup is too large to restore here.');
      let payload;
      try { payload = JSON.parse(await file.text()); } catch { throw new Sync.SyncError('invalid_backup', 'Choose a valid Recall full-library JSON backup.'); }
      if (payload.format !== 'recall-library-backup-v1') throw new Sync.SyncError('invalid_backup', 'This is not a full-library backup. Use the existing card import for CSV, TSV or deck share files.');
      restoration = { library: Core.validateLibrary(payload.library), expected: local.read() };
      const counts = Core.summary(restoration.library);
      el('accountRestoreSummary').textContent = `Backup contains ${counts.decks} decks and ${counts.cards} cards.`;
      render();
    });
    el('accountCancelRestore').onclick = () => { restoration = null; render(); };
    el('accountConfirmRestore').onclick = () => run(async () => {
      local.replace(restoration.library, restoration.expected); restoration = null; reload();
    });
    const changed = () => service?.localChanged();
    const connection = () => render();
    window.addEventListener('recall:library-saved', changed);
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    render();
    if (enabled) {
      try { service = Sync.createService({ client: factory.create(), local, storage, namespace: factory.namespace, onChange: render }); run(() => service.start()); }
      catch (error) { enabled = false; render({ ...current, error: Sync.friendlyError(error) }); }
    }
    disposePrevious = () => {
      service?.dispose(); trigger.removeEventListener('click', open); document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('recall:library-saved', changed); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); dialog.remove();
    };
    return { service, dialog };
  }
  window.RecallAccount = { mount };
  mount();
})();
