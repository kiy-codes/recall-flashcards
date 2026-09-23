const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { createHash } = require('node:crypto');
const esbuild = require('esbuild');
const { validateConfig } = require('../sync-core');
const root = path.resolve(__dirname, '..');
const WEB_FILES = ['index.html', 'styles.css', 'app.js', 'test-utils.js', 'subject-utils.js', 'scheduler.js', 'completion-utils.js', 'metadata-utils.js', 'sync-core.js', 'sync-service.js', 'account-ui.js', 'cloud-client.js', 'web-offline.js', 'exampleText.txt'];

function readConfig(env = process.env) {
  let local = {};
  for (const name of ['.env', '.env.local']) {
    const filename = path.join(root, name);
    if (fs.existsSync(filename)) local = { ...local, ...parseEnv(fs.readFileSync(filename, 'utf8')) };
  }
  const values = { ...local, ...env };
  // Validate both supplied keys, even when only one will be used. A mistaken
  // privileged key stops the build before any generated file contains it.
  if (values.SUPABASE_ANON_KEY) validateConfig(values.SUPABASE_URL, values.SUPABASE_ANON_KEY);
  return validateConfig(values.SUPABASE_URL, values.SUPABASE_PUBLISHABLE_KEY || values.SUPABASE_ANON_KEY);
}
async function build({ web = false, config = readConfig() } = {}) {
  config = validateConfig(config.url, config.key);
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['cloud-client-entry.js'], outfile: 'cloud-client.js',
    bundle: true, platform: 'browser', format: 'iife', target: ['chrome120', 'firefox120', 'safari17'],
    minify: true, legalComments: 'inline',
    define: { __RECALL_SUPABASE_URL__: JSON.stringify(config.url), __RECALL_SUPABASE_KEY__: JSON.stringify(config.key) },
  });
  if (web) {
    const output = path.join(root, 'dist-web');
    fs.mkdirSync(output, { recursive: true });
    for (const file of WEB_FILES) fs.copyFileSync(path.join(root, file), path.join(output, file));
    const hash = createHash('sha256');
    for (const file of WEB_FILES) hash.update(fs.readFileSync(path.join(output, file)));
    const cache = 'recall-shell-' + hash.digest('hex').slice(0, 16);
    fs.writeFileSync(path.join(output, 'service-worker.js'), `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(WEB_FILES.map(file => './' + file))};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('recall-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./index.html', self.location.href))));
  } else if (FILES.some(file => new URL(file, self.location.href).href === url.href)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
`);
    // Fail closed if an unexpected file is present; never deploy source, env,
    // tests, desktop binaries, or an old artifact left by another build.
    const unexpected = fs.readdirSync(output).filter(file => !WEB_FILES.includes(file) && file !== 'service-worker.js');
    if (unexpected.length) throw new Error('dist-web contains unexpected files. Use a fresh output folder before deploying.');
  }
  console.log(`Built ${web ? 'static website' : 'desktop client'}; optional cloud ${config.enabled ? 'configured' : 'disabled'}.`);
}
if (require.main === module) build({ web: process.argv.includes('--web') }).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { build, readConfig, WEB_FILES };
