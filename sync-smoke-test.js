const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { WEB_FILES } = require('./scripts/build');
app.setName('Recall Cloud Smoke Test');
app.setPath('userData', path.join(app.getPath('temp'), `recall-cloud-smoke-${process.pid}`));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  let server;
  const windows = [];
  try {
    const root = path.join(__dirname, 'dist-web');
    const allowed = new Set([...WEB_FILES, 'service-worker.js']);
    server = http.createServer((request, response) => {
      const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
      if (!allowed.has(name)) { response.writeHead(404); response.end(); return; }
      const type = name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
      response.writeHead(200, { 'Content-Type': type }); response.end(fs.readFileSync(path.join(root, name)));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    for (const platform of ['electron', 'web']) {
      const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, partition: `recall-sync-${platform}-${process.pid}` } });
      windows.push(window);
      window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file://') && !details.url.startsWith('http://127.0.0.1:') && !details.url.startsWith('blob:') }));
      window.webContents.session.on('will-download', event => event.preventDefault());
      const load = () => platform === 'electron' ? window.loadFile(path.join(__dirname, 'index.html')) : window.loadURL(`http://127.0.0.1:${server.address().port}/`);
      await load();
      await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'tests/sync-fixtures.js'), 'utf8'));
      const result = await window.webContents.executeJavaScript(`(async () => {
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const wait = () => new Promise(resolve => setTimeout(resolve, 10));
        const until = async predicate => { for (let i = 0; i < 300; i++) { if (predicate()) return; await wait(); } throw new Error('Timed out waiting for UI'); };
        const el = id => document.getElementById(id);
        const click = id => el(id).click();
        assert(window.RecallCloudClient && !RecallCloudClient.enabled, 'Test build unexpectedly enabled real cloud');
        click('accountBtn');
        assert(el('accountDialog').open && !el('accountSetup').hidden, 'Unconfigured app account dialog unavailable');
        assert(el('accountAuthForm').hidden, 'Unconfigured credentials form should not be shown');
        click('accountClose');
        state.sets[0].cards.push(normaliseCard({ id: 'smoke-card', front: 'Local question', back: 'Local answer' })); save(); render();
        const original = RecallLibrary.read();
        const client = RecallSyncFixtures.fakeClient();
        let reloads = 0;
        const mounted = RecallAccount.mount({ factory: { enabled: true, namespace: 'smoke-project', create: () => client }, reload: () => { reloads++; } });
        const idle = () => until(() => !mounted.service.getState().busy);
        await idle(); click('accountBtn');
        assert(el('accountIdentity').textContent === 'Signed out', 'Signed-out state is incorrect');
        client.confirmEmail = true;
        el('accountEmail').value = 'learner@example.test'; el('accountPassword').value = 'password';
        el('accountAuthForm').requestSubmit(el('accountSignUp')); await idle();
        assert(el('accountStatus').textContent.includes('Check your email'), 'Confirmation-required signup has no guidance');
        client.authError = { code: 'invalid_credentials' };
        el('accountPassword').value = 'wrong-password'; el('accountAuthForm').requestSubmit(el('accountSignIn')); await idle();
        assert(!el('accountError').hidden && el('accountError').textContent.includes('incorrect'), 'Invalid credentials were not explained');
        assert(el('accountPassword').value === '', 'Password stayed in the form');
        client.authError = null;
        el('accountPassword').value = 'password'; el('accountAuthForm').requestSubmit(el('accountSignIn')); await idle();
        assert(el('accountIdentity').textContent.includes('learner@example.test'), 'Signed-in email missing');
        assert(client.calls.length === 0, 'Sign-in synced the library automatically');
        click('accountUpload'); await idle();
        assert(!el('accountChoice').hidden && client.rows.size === 0, 'Upload did not wait for preview confirmation');
        click('accountCancelSync'); await idle(); assert(client.rows.size === 0, 'Cancel uploaded data');
        click('accountUpload'); await idle(); click('accountKeepLocal'); await idle();
        assert(client.rows.has('user-1') && !el('accountLastSync').textContent.includes('never'), 'Upload or last sync failed');
        const cloud = RecallSyncFixtures.copy(original); cloud.sets[0].name = 'From cloud'; client.seed('user-1', cloud, 2);
        click('accountDownload'); await idle();
        assert(!el('accountConflict').hidden, 'New revision was not shown as a conflict');
        click('accountKeepLocal'); await idle(); assert(RecallLibrary.read().sets[0].name !== 'From cloud', 'Keep local replaced local data');
        click('accountDownload'); await idle();
        client.seed('user-1', cloud, 3); click('accountUseCloud'); await idle();
        assert(el('accountError').textContent.includes('changed'), 'Race on download did not surface an error');
        assert(reloads === 0, 'Conflicted download reloaded');
        client.requestError = new TypeError('Failed to fetch'); click('accountDownload'); await idle();
        assert(el('accountError').textContent.includes('unreachable'), 'Offline request error missing');
        client.requestError = null;
        click('accountSignOut'); await idle(); assert(el('accountIdentity').textContent === 'Signed out', 'Sign-out state failed');
        assert(RecallSyncCore.equal(RecallLibrary.read(), original), 'Authentication modified local decks');
        client.setSession(RecallSyncFixtures.session);
        click('accountDownload'); await idle(); click('accountUseCloud'); await idle();
        assert(reloads === 1, 'Successful download did not request reloading the library');
        assert(JSON.parse(localStorage.getItem(RecallSyncCore.STORAGE_KEY)).sets[0].name === 'From cloud', 'Downloaded library was not written to localStorage');
        assert(JSON.parse(localStorage.getItem(RecallSyncCore.RECOVERY_KEY)).library.sets[0].name === original.sets[0].name, 'Previous library recovery copy missing');
        return 'Account, auth, preview, conflict, offline error and recovery checks passed.';
      })()`);
      console.log(platform + ': ' + result);
      await load();
      await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'tests/sync-fixtures.js'), 'utf8'));
      console.log(await window.webContents.executeJavaScript(`(async () => {
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const wait = () => new Promise(resolve => setTimeout(resolve, 20));
        assert(state.sets[0].name === 'From cloud', 'Cloud snapshot did not survive reloading');
        const client = RecallSyncFixtures.fakeClient(RecallSyncFixtures.session);
        const mounted = RecallAccount.mount({ factory: { enabled: true, namespace: 'smoke-project', create: () => client }, reload: () => {} });
        for (let i = 0; i < 100 && mounted.service.getState().busy; i++) await wait();
        assert(document.getElementById('accountIdentity').textContent.includes('learner@example.test'), 'Session restoration failed');
        assert(client.calls.length === 0, 'Session restoration automatically synced data');
        document.getElementById('accountBtn').click();
        const backup = { format: 'recall-library-backup-v1', library: RecallSyncFixtures.library() };
        const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' }));
        const input = document.getElementById('accountBackupFile'); input.files = transfer.files; input.dispatchEvent(new Event('change'));
        for (let i = 0; i < 100 && document.getElementById('accountRestore').hidden; i++) await wait();
        assert(!document.getElementById('accountRestore').hidden, 'Import confirmation is missing');
        assert(state.sets[0].name === 'From cloud', 'Import replaced data without confirmation');
        document.getElementById('accountCancelRestore').click();
        assert(state.sets[0].name === 'From cloud', 'Cancelled import changed local data');
        document.getElementById('accountClose').click();
        return 'Session restoration, reload and backup import preview checks passed.';
      })()`));
      if (platform === 'web') {
        await window.webContents.executeJavaScript('navigator.serviceWorker.ready.then(() => true)');
        // Chromium can exempt localhost from network emulation. Stop the local
        // server as well so an offline reload cannot accidentally use it.
        await new Promise(resolve => server.close(resolve));
        window.webContents.session.enableNetworkEmulation({ offline: true });
        const loaded = once(window.webContents, 'did-finish-load'); window.reload(); await loaded;
        const offline = await window.webContents.executeJavaScript(`(async () => ({ hasLibrary: Boolean(window.RecallLibrary), name: typeof state === 'undefined' ? null : state.sets[0]?.name, online: navigator.onLine, controller: Boolean(navigator.serviceWorker.controller), networkBlocked: await fetch('/offline-check').then(() => false, () => true) }))()`);
        if (!offline.hasLibrary || offline.name !== 'From cloud' || !offline.networkBlocked) throw new Error('Static website failed to reopen offline with its local library: ' + JSON.stringify(offline));
        console.log('web: Offline reload from the cached application passed.');
        window.webContents.session.disableNetworkEmulation();
      }
      window.destroy();
    }
  } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
  finally { windows.forEach(window => { if (!window.isDestroyed()) window.destroy(); }); server?.close(); app.exit(process.exitCode || 0); }
});
