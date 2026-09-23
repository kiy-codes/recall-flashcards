const { spawnSync } = require('node:child_process');
const { build } = require('./build');
const path = require('node:path');
async function main() {
  // Smoke tests always compile with cloud disabled, even if .env.local exists.
  await build({ web: true, config: { url: '', key: '' } });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let resultCode = 0;
  try {
    for (const file of ['smoke-test.js', 'sync-smoke-test.js']) {
      const result = spawnSync(require('electron'), [path.resolve(__dirname, '..', file)], { env, stdio: 'inherit', timeout: 120000, windowsHide: true });
      if (result.error) throw result.error;
      if (result.status !== 0) { resultCode = result.status || 1; break; }
    }
  } finally {
    // Restore the user's generated config after testing; credentials are never used by tests.
    await build({ web: true });
  }
  process.exitCode = resultCode;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
