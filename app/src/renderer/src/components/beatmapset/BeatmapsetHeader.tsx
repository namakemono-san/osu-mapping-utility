import type { Beatmapset } from '../../services'
import { assetUrl } from '../../utils/paths'

interface BeatmapsetHeaderProps {
  beatmapset: Beatmapset
  action?: React.ReactNode
  children: React.ReactNode
}

export function BeatmapsetHeader({
  beatmapset,
  action,
  children
}: BeatmapsetHeaderProps): React.JSX.Element {
  const bgUrl = assetUrl(beatmapset.folderPath, beatmapset.backgroundFile)

  return (
    <div
      className="relative shrink-0 bg-surface-dark bg-cover bg-center"
      style={{ backgroundImage: bgUrl ? `url("${bgUrl}")` : undefined }}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xl font-semibold leading-snug text-white">
              {beatmapset.artist} - {beatmapset.title}
            </p>
            <p className="mt-1 text-sm text-white/60">
              Beatmapset by{' '}
              <button
                onClick={() =>
                  window.api.shell.openExternal(`https://osu.ppy.sh/users/${beatmapset.creator}`)
                }
                className="text-white/90 underline-offset-2 transition-colors hover:text-primary hover:underline"
              >
                {beatmapset.creator}
              </button>
            </p>
          </div>
          {action}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-[hsl(200deg_10%_10%/50%)] p-1.5">
          {children}
        </div>
      </div>
    </div>
  )
}
