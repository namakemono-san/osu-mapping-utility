import { useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import ReactMarkdown from 'react-markdown'

type ChangelogEntry = {
  version: string
  title: string
  body: string
}

function parseSemver(version: string): [number, number, number] {
  const parts = version
    .replace(/[^0-9.]/g, '')
    .split('.')
    .map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function compareSemverDesc(a: string, b: string): number {
  const ap = parseSemver(a)
  const bp = parseSemver(b)
  for (let i = 0; i < 3; i++) {
    if (ap[i] !== bp[i]) return bp[i] - ap[i]
  }
  return 0
}

function parseEntry(raw: string, version: string): ChangelogEntry {
  const trimmed = raw.trim()
  const lines = trimmed.split('\n')
  if (lines[0]?.startsWith('## ')) {
    return {
      version,
      title: lines[0].slice(3).trim(),
      body: lines.slice(1).join('\n').trim()
    }
  }
  return { version, title: version, body: trimmed }
}

function loadEntries(): ChangelogEntry[] {
  const files = import.meta.glob('../content/changelog/*.md', {
    eager: true,
    query: '?raw',
    import: 'default'
  }) as Record<string, string>

  return Object.entries(files)
    .map(([path, raw]) => {
      const match = path.match(/[\\/]([^/\\]+)\.md$/)
      if (!match) return null
      return parseEntry(raw, match[1])
    })
    .filter((e): e is ChangelogEntry => e !== null)
    .sort((a, b) => compareSemverDesc(a.version, b.version))
}

const ENTRIES = loadEntries()

export function Home(): React.JSX.Element {
  const entries = ENTRIES
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(entries[0] ? [entries[0].version] : [])
  )

  const toggle = (version: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="mx-auto max-w-2xl space-y-3">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Changelog</h2>
        {entries.length === 0 && (
          <p className="text-sm text-text-muted">No changelog entries yet.</p>
        )}
        {entries.map((entry, i) => {
          const isExpanded = expanded.has(entry.version)
          const isLatest = i === 0
          return (
            <div
              key={entry.version}
              className="overflow-hidden rounded-xl border border-border-subtle bg-surface-dark"
            >
              <button
                onClick={() => toggle(entry.version)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm text-text-muted">{entry.version}</span>
                  <span className="text-sm font-medium text-text-primary">{entry.title}</span>
                  {isLatest && (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Latest
                    </span>
                  )}
                </div>
                <IconChevronDown
                  size={16}
                  stroke={1.5}
                  className={`shrink-0 text-text-muted transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              {isExpanded && entry.body && (
                <div className="border-t border-border-subtle px-4 pb-4 pt-3">
                  <ReactMarkdown
                    components={{
                      h3: ({ children }) => (
                        <h3 className="mt-4 mb-1.5 text-sm font-semibold text-text-primary first:mt-0">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-sm leading-relaxed text-text-secondary">{children}</p>
                      ),
                      ul: ({ children }) => <ul className="mt-1.5 space-y-1.5">{children}</ul>,
                      li: ({ children }) => (
                        <li className="flex items-start gap-2.5 text-sm text-text-secondary">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                          <span className="leading-relaxed">{children}</span>
                        </li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-medium text-text-primary">{children}</strong>
                      )
                    }}
                  >
                    {entry.body}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
