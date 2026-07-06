import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = rootPkg.version

if (args.includes('--print')) {
  process.stdout.write(version)
  process.exit(0)
}

const jsonManifests = [join(root, 'app/package.json')]

const xmlManifests = [
  join(root, 'MappingUtility.Parser/MappingUtility.Parser.csproj'),
  join(root, 'MappingUtility.Server/MappingUtility.Server.csproj'),
  join(root, 'MappingUtility.Logging/MappingUtility.Logging.csproj')
]

const versionTagRe = /<Version>[^<]*<\/Version>/

function readXmlVersion(path) {
  const content = readFileSync(path, 'utf8')
  const match = content.match(versionTagRe)
  if (!match) throw new Error(`No <Version> tag found in ${path}`)
  return match[0].slice('<Version>'.length, -'</Version>'.length)
}

if (args.includes('--check')) {
  let ok = true
  for (const path of jsonManifests) {
    const pkg = JSON.parse(readFileSync(path, 'utf8'))
    if (pkg.version !== version) {
      console.error(`Version mismatch: root=${version}, ${path}=${pkg.version}`)
      ok = false
    }
  }
  for (const path of xmlManifests) {
    const xmlVersion = readXmlVersion(path)
    if (xmlVersion !== version) {
      console.error(`Version mismatch: root=${version}, ${path}=${xmlVersion}`)
      ok = false
    }
  }
  if (!ok) process.exit(1)
  console.log(`All manifests in sync at v${version}`)
  process.exit(0)
}

for (const path of jsonManifests) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  if (pkg.version === version) continue
  pkg.version = version
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`Synced ${path} to v${version}`)
}

for (const path of xmlManifests) {
  const content = readFileSync(path, 'utf8')
  if (readXmlVersion(path) === version) continue
  const updated = content.replace(versionTagRe, `<Version>${version}</Version>`)
  writeFileSync(path, updated)
  console.log(`Synced ${path} to v${version}`)
}
