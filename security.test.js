const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('desktop renderer has no Node integration, open-window path, or IPC bridge', () => {
  const main = source('main.js');
  const preload = source('preload.js');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate.*preventDefault/);
  assert.match(main, /setPermissionRequestHandler.*callback\(false\)/);
  assert.doesNotMatch(main + preload, /ipcMain|ipcRenderer|executeJavaScript|shell\.openExternal/);
});

test('desktop and Vercel apply restrictive script, object, and frame policies', () => {
  const html = source('index.html');
  const config = JSON.parse(source('vercel.json'));
  const policy = config.headers.find(entry => entry.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  for (const directive of ["script-src 'self'", "object-src 'none'", "frame-src 'none'"]) {
    assert.ok(html.includes(directive));
    assert.ok(policy.includes(directive));
  }
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes('upgrade-insecure-requests'));
  assert.ok(config.headers.some(entry => entry.source === '/(.*)' && entry.headers.some(header => header.key === 'Referrer-Policy')));
});

test('auth sessions are not persisted in localStorage, and only public keys enter builds', () => {
  const client = source('cloud-client-entry.js');
  const sharing = source('share-ui.js');
  const build = source('scripts/build.js');
  assert.match(client, /storage:\s*window\.sessionStorage/);
  assert.match(client, /window\.localStorage\.removeItem\(storageKey\)/);
  assert.doesNotMatch(client, /storage:\s*window\.localStorage/);
  assert.match(sharing, /sessionStorage\.setItem\(key/);
  assert.doesNotMatch(sharing, /localStorage\.setItem\(key/);
  assert.match(build, /validateConfig\(values\.SUPABASE_URL, values\.SUPABASE_PUBLISHABLE_KEY \|\| values\.SUPABASE_ANON_KEY\)/);
  assert.doesNotMatch(build, /SUPABASE_SERVICE_ROLE_KEY/);
});
