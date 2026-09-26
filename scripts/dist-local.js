const fs = require('node:fs');
const path = require('node:path');
const { build: buildClient, WEB_FILES } = require('./build');
const { validateConfig } = require('../sync-core');

const root = path.resolve(__dirname, '..');
const platforms = {
  win: { host: 'win32', folder: 'windows', targets: ['nsis', 'portable', 'zip', 'msi'], manual: ['appx'] },
  linux: { host: 'linux', folder: 'linux', targets: ['AppImage', 'deb', 'rpm', 'tar.gz'], manual: [] },
  mac: { host: 'darwin', folder: 'macos', targets: ['dmg', 'zip'], manual: ['pkg'] },
};
const APP_FILES = [...WEB_FILES.filter(file => file !== 'cloud-client.js'), 'main.js', 'preload.js'];

function parseArgs(args, host = process.platform, hostArch = process.arch) {
  const [command = 'current', ...rest] = args;
  if (command === 'check' && rest.length === 0) return { check: true };
  const platform = command === 'current'
    ? Object.keys(platforms).find(key => platforms[key].host === host) : command;
  const spec = platforms[platform];
  if (!spec) throw new Error('Choose win, linux, mac, current, or check.');
  let arch = hostArch;
  let target;
  let cloud = false;
  for (const arg of rest) {
    if (arg === '--with-cloud') cloud = true;
    else if (arg === '--x64' || arg === '--arm64') arch = arg.slice(2);
    else if ([...spec.targets, ...spec.manual].includes(arg) && !target) target = arg;
    else throw new Error(`Unsupported argument: ${arg}. Output and publishing options cannot be overridden.`);
  }
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Use --x64 or --arm64.');
  if (host !== spec.host) {
    throw new Error(`${platform} packages require a ${spec.host} host in this local workflow. ` +
      'Use a Linux machine/VM/container for Linux, or a Mac for macOS. No files were generated.');
  }
  return { platform, arch, cloud, targets: target ? [target] : spec.targets.slice() };
}

function releaseConfig(withCloud, env = process.env) {
  // Deliberately never read .env or .env.local, including on an opted-in build.
  if (!withCloud) return { enabled: false, url: '', key: '' };
  if (env.SUPABASE_ANON_KEY) validateConfig(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const config = validateConfig(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY);
  if (!config.enabled) throw new Error('--with-cloud requires public Supabase values in the process environment.');
  return config;
}

function localEnvironment(env = process.env) {
  // Keep download/proxy/cache settings, but remove signing and publishing credentials.
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key]) =>
      !/^(CSC_|WIN_CSC_|APPLE_|GH_|GITHUB_|BT_|KEYCHAIN_|AZURE_|AWS_|SUPABASE_|RECALL_RELEASE_)/i.test(key))),
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  };
}

function ensureDirectory(parent, name) {
  const directory = path.resolve(parent, name);
  if (path.dirname(directory) !== parent) throw new Error('Release directory must stay inside its intended parent.');
  try { fs.mkdirSync(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) {
    throw new Error(`Refusing redirected release directory: ${directory}`);
  }
  return directory;
}

function createOutput(projectRoot, version, platform, arch) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Invalid release version.');
  }
  if (!platforms[platform] || !['x64', 'arm64'].includes(arch)) throw new Error('Invalid platform or architecture.');
  const project = fs.realpathSync(projectRoot);
  const release = ensureDirectory(project, `release-${version}`);
  const platformDir = ensureDirectory(release, platforms[platform].folder);
  const archDir = ensureDirectory(platformDir, arch);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // A new directory per invocation: builder may empty its own unpacked directories,
  // but can never delete an earlier build or unrelated files in the release folder.
  const output = fs.mkdtempSync(path.join(archDir, `build-${stamp}-`));
  return { release, output };
}

async function stageApp(output, metadata, config) {
  const app = ensureDirectory(output, '.app');
  for (const file of APP_FILES) fs.copyFileSync(path.join(root, file), path.join(app, file), fs.constants.COPYFILE_EXCL);
  // All renderer dependencies are bundled by esbuild. Electron main/preload only
  // require Electron/Node built-ins; no root node_modules, env files or scripts ship.
  const appMetadata = Object.fromEntries(['name', 'version', 'description', 'main', 'author', 'license', 'homepage']
    .map(key => [key, metadata[key]]).filter(([, value]) => value !== undefined));
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(appMetadata, null, 2) + '\n', { flag: 'wx' });
  await buildClient({ config, outfile: path.join(app, 'cloud-client.js') });
  return app;
}

function builderConfig(metadata, app, output) {
  return {
    ...structuredClone(metadata.build),
    extends: null,
    directories: { app, output },
    electronVersion: require('electron/package.json').version,
    npmRebuild: false,
    publish: null,
    forceCodeSigning: false,
    afterPack: verifyPackagedApp,
  };
}

function verifyPackagedApp(context) {
  const asar = require('@electron/asar');
  const resources = context.packager.getResourcesDir(context.appOutDir);
  const archive = path.join(resources, 'app.asar');
  const expected = [...APP_FILES, 'cloud-client.js', 'package.json'].sort();
  const actual = asar.listPackage(archive).map(file => file.replace(/^[\\/]+/, '')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Packaged app contains missing or unexpected files; refusing to create installers.');
  }
  const client = fs.readFileSync(path.join(context.packager.info.appDir, 'cloud-client.js'));
  if (!asar.extractFile(archive, 'cloud-client.js').equals(client)) {
    throw new Error('Packaged client differs from the isolated release client.');
  }
  console.log('Verified packaged application allowlist and isolated client.');
}

async function checkConfig(metadata) {
  const { validateConfiguration } = require('app-builder-lib/out/util/config/config');
  const { DebugLogger } = require('builder-util');
  await validateConfiguration(metadata.build, new DebugLogger(false));
  console.log(`Electron Builder ${require('electron-builder/package.json').version}: configuration valid for all platforms.`);
}

async function main(args = process.argv.slice(2)) {
  const plan = parseArgs(args);
  const metadata = require('../package.json');
  await checkConfig(metadata);
  if (plan.check) return;
  const cloud = releaseConfig(plan.cloud);
  // Sanitize only this dedicated build process, never the user's shell.
  const env = localEnvironment();
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
  const { release, output } = createOutput(root, metadata.version, plan.platform, plan.arch);
  const notes = [
    `# Recall Flashcards ${metadata.version} - local build`, '',
    `Platform: ${plan.platform}; architecture: ${plan.arch}; targets: ${plan.targets.join(', ')}.`,
    `Optional cloud: ${cloud.enabled ? 'explicitly configured with public environment values' : 'disabled'}.`,
    'No env files are copied. Signing, notarization and publishing are disabled.',
    'No commit, tag, GitHub release, push or upload is performed.',
    'AppX is an unsigned manual preview; normal installation requires certificate trust.',
    'Linux requires a Linux host/toolchain; macOS DMG/ZIP/PKG require a Mac.',
    'MSIX and signed/store distribution are manual/future only.',
    'The .app directory is generated packaging input; unpacked folders are builder output.',
    'Each invocation gets a new build directory. Older files are never cleaned.', '',
  ].join('\n');
  const notePath = path.join(output, 'BUILD-NOTES.md');
  fs.writeFileSync(notePath, notes + '\nStatus: building.\n', { flag: 'wx' });
  console.log(`Local release folder: ${release}\nBuild output: ${output}`);
  if (plan.targets.includes('appx')) console.log('Manual AppX preview: unsigned, not a ready-to-install Store package.');
  console.log(`Other OS targets are manual on their own hosts; this run builds ${plan.platform} only.`);
  try {
    const app = await stageApp(output, metadata, cloud);
    const { build, Platform, Arch } = require('electron-builder');
    const platform = { win: Platform.WINDOWS, linux: Platform.LINUX, mac: Platform.MAC }[plan.platform];
    const artifacts = await build({
      projectDir: root,
      targets: platform.createTarget(plan.targets, Arch[plan.arch]),
      config: builderConfig(metadata, app, output),
      publish: 'never',
    });
    fs.appendFileSync(notePath, '\nStatus: complete.\n\nArtifacts:\n' + artifacts.map(file => `- ${path.relative(output, file)}`).join('\n') + '\n');
    console.log(`Local artifacts complete: ${output}`);
  } catch (error) {
    fs.appendFileSync(notePath, '\nStatus: FAILED; partial output retained for inspection.\n');
    throw error;
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs, releaseConfig, localEnvironment, createOutput, stageApp, builderConfig, checkConfig, verifyPackagedApp };
