import { existsSync, mkdirSync, readdirSync, cpSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))
const binDir = join(appDir, 'resources', 'bin')
const force = process.argv.includes('--force')

async function download(url, destPath) {
  console.log(`  downloading ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { writeFileSync } = await import('node:fs')
  writeFileSync(destPath, buf)
}

function extractZip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true })
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
    ],
    { stdio: 'inherit' }
  )
}

function makeTempDir(label) {
  const dir = join(tmpdir(), `osu-mapping-utility-fetch-bin-${label}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full
    }
  }
  return null
}

async function fetchFfmpeg() {
  const ffmpegOk = existsSync(join(binDir, 'ffmpeg.exe'))
  const ffprobeOk = existsSync(join(binDir, 'ffprobe.exe'))
  if (!force && ffmpegOk && ffprobeOk)
    return console.log('ffmpeg/ffprobe already present, skipping')

  console.log('Fetching ffmpeg/ffprobe (gyan.dev essentials build)...')
  const tmp = makeTempDir('ffmpeg')
  const zipPath = join(tmp, 'ffmpeg.zip')
  await download('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', zipPath)
  extractZip(zipPath, tmp)

  const ffmpegExe = findFile(tmp, 'ffmpeg.exe')
  const ffprobeExe = findFile(tmp, 'ffprobe.exe')
  if (!ffmpegExe || !ffprobeExe)
    throw new Error('ffmpeg.exe/ffprobe.exe not found in downloaded archive')
  cpSync(ffmpegExe, join(binDir, 'ffmpeg.exe'))
  cpSync(ffprobeExe, join(binDir, 'ffprobe.exe'))
  rmSync(tmp, { recursive: true, force: true })
}

async function fetchDeno() {
  if (!force && existsSync(join(binDir, 'deno.exe')))
    return console.log('deno already present, skipping')

  console.log('Fetching deno...')
  const tmp = makeTempDir('deno')
  const zipPath = join(tmp, 'deno.zip')
  await download(
    'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip',
    zipPath
  )
  extractZip(zipPath, tmp)

  const denoExe = findFile(tmp, 'deno.exe')
  if (!denoExe) throw new Error('deno.exe not found in downloaded archive')
  cpSync(denoExe, join(binDir, 'deno.exe'))
  rmSync(tmp, { recursive: true, force: true })
}

async function fetchYtDlp() {
  if (!force && existsSync(join(binDir, 'yt-dlp.exe')))
    return console.log('yt-dlp already present, skipping')

  console.log('Fetching yt-dlp...')
  await download(
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    join(binDir, 'yt-dlp.exe')
  )
}

async function fetchWaifu2x() {
  const waifu2xDir = join(binDir, 'waifu2x')
  if (!force && existsSync(join(waifu2xDir, 'waifu2x-ncnn-vulkan.exe'))) {
    return console.log('waifu2x-ncnn-vulkan already present, skipping')
  }

  console.log('Fetching waifu2x-ncnn-vulkan...')
  const apiRes = await fetch(
    'https://api.github.com/repos/nihui/waifu2x-ncnn-vulkan/releases/latest'
  )
  if (!apiRes.ok) throw new Error(`GitHub API request failed: HTTP ${apiRes.status}`)
  const release = await apiRes.json()
  const asset = release.assets.find((a) => /windows/i.test(a.name) && a.name.endsWith('.zip'))
  if (!asset) throw new Error('No Windows asset found in latest waifu2x-ncnn-vulkan release')

  const tmp = makeTempDir('waifu2x')
  const zipPath = join(tmp, 'waifu2x.zip')
  await download(asset.browser_download_url, zipPath)
  extractZip(zipPath, tmp)

  const extractedRoot = readdirSync(tmp, { withFileTypes: true }).find((e) => e.isDirectory())
  if (!extractedRoot) throw new Error('Unexpected waifu2x-ncnn-vulkan archive layout')
  rmSync(waifu2xDir, { recursive: true, force: true })
  cpSync(join(tmp, extractedRoot.name), waifu2xDir, { recursive: true })
  rmSync(tmp, { recursive: true, force: true })
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('Skipping resources/bin fetch: this project only ships Windows binaries.')
    return
  }
  mkdirSync(binDir, { recursive: true })
  await fetchFfmpeg()
  await fetchDeno()
  await fetchYtDlp()
  await fetchWaifu2x()
  console.log('All external binaries are in place.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
