import { srColor } from '../../utils/srColor'

interface DiffPillsProps {
  diffs: { version: string; starRating?: number }[]
  activeVersion?: string
  selectedVersions?: Set<string>
  onSelect?: (version: string) => void
  variant?: 'overlay' | 'surface'
}

export function DiffPills({
  diffs,
  activeVersion,
  selectedVersions,
  onSelect,
  variant = 'surface'
}: DiffPillsProps): React.JSX.Element {
  return (
    <>
      {diffs.map((d) => {
        const isActive = selectedVersions
          ? selectedVersions.has(d.version)
          : d.version === activeVersion

        if (variant === 'overlay') {
          return onSelect ? (
            <button
              key={d.version}
              onClick={() => onSelect(d.version)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-white transition-all ${
                isActive
                  ? 'border border-primary/70 bg-primary/20'
                  : 'border border-transparent bg-surface-dark/55 hover:bg-primary/10'
              }`}
            >
              <div
                className={`h-4.5 w-1 rounded-full transition-colors ${isActive ? 'bg-primary' : 'bg-white/20'}`}
              />
              {d.version}
            </button>
          ) : (
            <div
              key={d.version}
              className="flex items-center gap-1.5 rounded-md border border-transparent bg-surface-dark/55 px-2.5 py-1.5 text-xs text-white"
            >
              <div
                className="h-4.5 w-1 rounded-full"
                style={{
                  backgroundColor:
                    d.starRating != null && d.starRating > 0
                      ? srColor(d.starRating)
                      : 'rgba(255,255,255,0.2)'
                }}
              />
              {d.version}
              {d.starRating != null && d.starRating > 0 && (
                <span className="tabular-nums text-white/40">{d.starRating.toFixed(2)}</span>
              )}
            </div>
          )
        }

        return (
          <button
            key={d.version}
            onClick={() => onSelect?.(d.version)}
            className={`no-drag shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors ${
              isActive ? 'bg-primary/20 text-primary' : 'text-text-dim hover:text-text-secondary'
            }`}
          >
            {d.version}
          </button>
        )
      })}
    </>
  )
}
