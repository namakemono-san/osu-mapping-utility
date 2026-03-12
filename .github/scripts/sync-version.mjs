import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function usage(exitCode = 0) {
  const msg = [
    'Usage:',
    '  node .github/scripts/sync-version.mjs            # sync manifests to tauri.conf.json version',
    '  node .github/scripts/sync-version.mjs --check    # verify versions are in sync (no write)',
    '  node .github/scripts/sync-version.mjs --print    # print version from tauri.conf.json',
  ].join('\n');
  process.stderr.write(msg + '\n');
  process.exit(exitCode);
}

const args = new Set(process.argv.slice(2));
if (args.has('-h') || args.has('--help')) usage(0);

const wantPrint = args.has('--print');
const wantCheck = args.has('--check');
if (wantPrint && wantCheck) {
  process.stderr.write('Error: --print and --check are mutually exclusive\n');
  usage(2);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');

const tauriConfPath = path.join(repoRoot, 'app', 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(repoRoot, 'app', 'src-tauri', 'Cargo.toml');
const cargoLockPath = path.join(repoRoot, 'app', 'src-tauri', 'Cargo.lock');
const packageJsonPath = path.join(repoRoot, 'app', 'package.json');
const csProjPath = path.join(repoRoot, 'MappingUtility.Server', 'MappingUtility.Server.csproj');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function writeText(filePath, text, eol) {
  const normalized = text.replace(/\r?\n/g, eol);
  fs.writeFileSync(filePath, normalized, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, obj, eol, indent = 2) {
  const text = JSON.stringify(obj, null, indent) + eol;
  fs.writeFileSync(filePath, text, 'utf8');
}

function assertVersionLike(v) {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Invalid version: ${String(v)}`);
  }

  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v)) {
    throw new Error(`Version is not semver-like: ${v}`);
  }
}

function syncPackageJson(version, mode) {
  const beforeText = readText(packageJsonPath);
  const eol = detectEol(beforeText);
  const pkg = JSON.parse(beforeText);
  const before = pkg.version;
  const inSync = before === version;

  if (mode === 'check') return { file: 'app/package.json', inSync };
  if (!inSync) {
    pkg.version = version;
    writeJson(packageJsonPath, pkg, eol, 2);
  }
  return { file: 'app/package.json', changed: !inSync };
}

function syncCargoToml(version, mode) {
  const beforeText = readText(cargoTomlPath);
  const eol = detectEol(beforeText);
  const lines = beforeText.replace(/\r?\n/g, '\n').split('\n');

  let inPackage = false;
  let found = false;
  let inSync = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\[package\]\s*$/.test(line)) {
      inPackage = true;
      continue;
    }
    if (inPackage && /^\[.+\]\s*$/.test(line)) {
      break;
    }
    if (inPackage && /^version\s*=\s*"[^"]*"\s*$/.test(line)) {
      found = true;
      const current = line.match(/^version\s*=\s*"([^"]*)"\s*$/)?.[1];
      inSync = current === version;
      if (mode !== 'check' && !inSync) {
        lines[i] = `version = "${version}"`;
      }
      break;
    }
  }

  if (!found) throw new Error('Cargo.toml: [package].version not found');
  if (mode === 'check') return { file: 'app/src-tauri/Cargo.toml', inSync };

  const afterText = lines.join('\n');
  const changed = afterText.replace(/\r?\n/g, eol) !== beforeText;
  if (changed) writeText(cargoTomlPath, afterText, eol);
  return { file: 'app/src-tauri/Cargo.toml', changed };
}

function syncCargoLock(version, mode) {
  const beforeText = readText(cargoLockPath);
  const eol = detectEol(beforeText);
  const lines = beforeText.replace(/\r?\n/g, '\n').split('\n');

  let inBlock = false;
  let blockHasName = false;
  let inSync = true;
  let touched = 0;
  let foundAny = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '[[package]]') {
      inBlock = true;
      blockHasName = false;
      continue;
    }
    if (inBlock && line.trim() === '') {
      inBlock = false;
      blockHasName = false;
      continue;
    }
    if (!inBlock) continue;

    if (line.startsWith('name = ')) {
      const name = line.match(/^name\s*=\s*"([^"]+)"/)?.[1];
      blockHasName = name === 'osu-mapping-utility';
      continue;
    }
    if (blockHasName && line.startsWith('version = ')) {
      foundAny = true;
      const current = line.match(/^version\s*=\s*"([^"]+)"/)?.[1];
      if (current !== version) inSync = false;
      if (mode !== 'check' && current !== version) {
        lines[i] = `version = "${version}"`;
        touched++;
      }
    }
  }

  if (!foundAny) throw new Error('Cargo.lock: package osu-mapping-utility not found');
  if (mode === 'check') return { file: 'app/src-tauri/Cargo.lock', inSync };
  const afterText = lines.join('\n');
  const changed = touched > 0;
  if (changed) writeText(cargoLockPath, afterText, eol);
  return { file: 'app/src-tauri/Cargo.lock', changed };
}

function syncCsProj(version, mode) {
  const label = 'MappingUtility.Server/MappingUtility.Server.csproj';
  const beforeText = readText(csProjPath);
  const eol = detectEol(beforeText);
  const match = beforeText.match(/<Version>([^<]*)<\/Version>/);

  if (!match) {
    if (mode === 'check') return { file: label, inSync: false };
    const newText = beforeText.replace(
      /(<PropertyGroup>)/,
      `$1\n    <Version>${version}</Version>`,
    );
    writeText(csProjPath, newText, eol);
    return { file: label, changed: true };
  }

  const current = match[1];
  const inSync = current === version;
  if (mode === 'check') return { file: label, inSync };

  if (!inSync) {
    const newText = beforeText.replace(/<Version>[^<]*<\/Version>/, `<Version>${version}</Version>`);
    writeText(csProjPath, newText, eol);
  }
  return { file: label, changed: !inSync };
}

function main() {
  const conf = readJson(tauriConfPath);
  const version = conf?.version;
  assertVersionLike(version);

  if (wantPrint) {
    process.stdout.write(String(version));
    return;
  }

  const mode = wantCheck ? 'check' : 'write';
  const results = [
    syncPackageJson(version, mode),
    syncCargoToml(version, mode),
    syncCargoLock(version, mode),
    syncCsProj(version, mode),
  ];

  if (mode === 'check') {
    const bad = results.filter((r) => !r.inSync);
    if (bad.length) {
      for (const r of bad) {
        process.stderr.write(`Version mismatch: ${r.file}\n`);
      }
      process.exit(1);
    }
    return;
  }

  const changed = results.filter((r) => r.changed).map((r) => r.file);
  if (changed.length) {
    process.stdout.write(`Updated: ${changed.join(', ')}\n`);
  } else {
    process.stdout.write('No changes\n');
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(String(err?.stack || err) + '\n');
  process.exit(1);
}
