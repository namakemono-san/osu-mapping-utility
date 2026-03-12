/**
 * Builds MappingUtility.Server and copies the binary to src-tauri/binaries/.
 * Runs before `tauri dev` and `tauri build`.
 */

import { execSync } from 'child_process';
import { copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, '..');
const repoRoot = join(appDir, '..');

const serverProject = join(repoRoot, 'MappingUtility.Server');
const publishDir = join(repoRoot, 'publish', 'server');
const sourceBinary = join(publishDir, 'MappingUtility.Server.exe');
const targetBinary = join(
  appDir,
  'src-tauri',
  'binaries',
  'MappingUtility.Server-x86_64-pc-windows-msvc.exe',
);

console.log('[build-server] dotnet publish...');
execSync(
  `dotnet publish "${serverProject}" -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o "${publishDir}"`,
  { stdio: 'inherit' },
);

console.log('[build-server] Copying binary to src-tauri/binaries/...');
copyFileSync(sourceBinary, targetBinary);

console.log('[build-server] Done.');
