const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { parseArgs, releaseConfig, localEnvironment, createOutput, stageApp, builderConfig, checkConfig, verifyPackagedApp } = require('./scripts/dist-local');
const metadata = require('./package.json');

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'recall-release-test-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('local defaults only build the current host; manual formats require explicit selection', () => {
  assert.deepEqual(parseArgs(['current'], 'win32', 'x64').targets, ['nsis', 'portable', 'zip', 'msi']);
  assert.deepEqual(parseArgs(['current'], 'linux', 'x64').targets, ['AppImage', 'deb', 'rpm', 'tar.gz']);
  assert.deepEqual(parseArgs(['current'], 'darwin', 'arm64').targets, ['dmg', 'zip']);
  assert.deepEqual(parseArgs(['win', 'appx'], 'win32', 'x64').targets, ['appx']);
  assert.deepEqual(parseArgs(['mac', 'pkg', '--x64'], 'darwin', 'arm64').targets, ['pkg']);
  for (const platform of ['linux', 'mac']) assert.throws(() => parseArgs([platform], 'win32', 'x64'), /host/);
  for (const option of ['--publish=always', '--publish', '--config', '--output=../other', 'msix']) {
    assert.throws(() => parseArgs(['win', option], 'win32', 'x64'), /Unsupported argument/);
  }
});

test('release cloud configuration requires opt-in and rejects privileged keys', () => {
  const env = { SUPABASE_URL: 'https://release-test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
  assert.equal(releaseConfig(false, env).enabled, false);
  assert.equal(releaseConfig(false, { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_bundle' }).key, '');
  assert.equal(releaseConfig(true, env).enabled, true);
  assert.throws(() => releaseConfig(true, {}), /requires public/);
  assert.throws(() => releaseConfig(true, { ...env, SUPABASE_ANON_KEY: 'sb_secret_never_bundle' }), /Only a publishable/);
});

test('builder child environment excludes signing and upload credentials without changing the caller', () => {
  const env = { PATH: 'tools', HTTPS_PROXY: 'proxy', CSC_LINK: 'private', WIN_CSC_LINK: 'private',
    APPLE_API_KEY: 'private', GH_TOKEN: 'private', GITHUB_TOKEN: 'private', AZURE_TOKEN: 'private',
    AWS_SECRET_ACCESS_KEY: 'private', SUPABASE_ANON_KEY: 'private' };
  assert.deepEqual(localEnvironment(env), { PATH: 'tools', HTTPS_PROXY: 'proxy', CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
  assert.equal(env.CSC_LINK, 'private');
});

test('repeat builds preserve earlier artifacts and unrelated release files', t => {
  const project = fixture(t);
  const first = createOutput(project, '1.1.0', 'win', 'x64');
  const sentinel = path.join(first.release, 'my-notes.txt');
  const previousArtifact = path.join(first.output, 'previous.exe');
  fs.writeFileSync(sentinel, 'keep notes');
  fs.writeFileSync(previousArtifact, 'keep artifact');
  const second = createOutput(project, '1.1.0', 'win', 'x64');
  assert.notEqual(first.output, second.output);
  assert.equal(first.release, second.release);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep notes');
  assert.equal(fs.readFileSync(previousArtifact, 'utf8'), 'keep artifact');
  assert.throws(() => createOutput(project, '../outside', 'win', 'x64'), /version/);
  assert.throws(() => createOutput(project, '1.1.0', '../outside', 'x64'), /platform/);
});

test('release paths reject directory links instead of following them', t => {
  const project = fixture(t);
  const elsewhere = fixture(t);
  const link = path.join(project, 'release-1.1.0');
  fs.symlinkSync(elsewhere, link, process.platform === 'win32' ? 'junction' : 'dir');
  // Unlink the fixture junction before removing the temporary project directory.
  t.after(() => { if (fs.existsSync(link)) fs.unlinkSync(link); });
  assert.throws(() => createOutput(project, '1.1.0', 'win', 'x64'), /redirected/);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
});

test('staging bundles an offline client without modifying development/web output or copying secrets', async t => {
  const output = fixture(t);
  const generated = ['cloud-client.js', 'dist-web/cloud-client.js'].map(file => path.join(__dirname, file));
  const before = generated.map(file => fs.existsSync(file) ? fs.readFileSync(file) : null);
  const app = await stageApp(output, { ...metadata, privateSecret: 'do-not-copy' }, releaseConfig(false));
  const stagedMetadata = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  assert.equal(stagedMetadata.dependencies, undefined);
  assert.equal(stagedMetadata.privateSecret, undefined);
  assert.equal(fs.existsSync(path.join(app, '.env.local')), false);
  assert.equal(fs.existsSync(path.join(app, 'node_modules')), false);
  const context = { window: {}, URL, TextEncoder, TextDecoder, console, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(app, 'cloud-client.js'), 'utf8'), context);
  assert.equal(context.window.RecallCloudClient.enabled, false);
  assert.equal(context.window.RecallCloudClient.namespace, '');
  assert.equal(context.window.RecallCloudClient.create(), null);
  generated.forEach((file, i) => assert.deepEqual(fs.existsSync(file) ? fs.readFileSync(file) : null, before[i]));
  const config = builderConfig(metadata, app, output);
  assert.equal(config.publish, null);
  assert.equal(config.win.signExecutable, false);
  assert.equal(config.mac.identity, null);
  assert.equal(config.mac.notarize, false);
  assert.equal(config.directories.output, output);
  const asar = require('@electron/asar');
  const resources = path.join(output, 'resources');
  fs.mkdirSync(resources);
  const archive = path.join(resources, 'app.asar');
  await asar.createPackage(app, archive);
  const packContext = { appOutDir: output, packager: { getResourcesDir: () => resources, info: { appDir: app } } };
  verifyPackagedApp(packContext);
  fs.writeFileSync(path.join(app, '.env.local'), 'FAKE_SECRET=never-ship');
  await asar.createPackage(app, archive);
  asar.uncache(archive);
  assert.throws(() => verifyPackagedApp(packContext), /unexpected files/);
});

test('all platform options satisfy the installed Electron Builder schema', async () => {
  await checkConfig(metadata);
});
