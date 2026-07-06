import { memo } from 'react'
import type { Beatmapset } from '../../utils/signalr'

export const CARD_HEIGHT = 100
export const GAP = 10
export const ITEM_HEIGHT = CARD_HEIGHT + GAP

interface BeatmapCardProps {
  data: Beatmapset
  isSelected: boolean
  onClick: (data: Beatmapset) => void
  onContextMenu: (e: React.MouseEvent, data: Beatmapset) => void
}

export const BeatmapCard = memo(function BeatmapCard({
  data,
  isSelected,
  onClick,
  onContextMenu
}: BeatmapCardProps): React.JSX.Element {
  const bgUrl = data.backgroundFile
    ? `asset:///${data.folderPath.replace(/\\/g, '/')}/${data.backgroundFile}`
    : null

  return (
    <div
      onClick={() => onClick(data)}
      onContextMenu={(e) => onContextMenu(e, data)}
      className={`relative cursor-pointer overflow-hidden rounded-lg ring-1 transition-all duration-150 ${
        isSelected ? 'ring-primary brightness-110' : 'ring-border-subtle hover:brightness-110'
      }`}
      style={{ height: CARD_HEIGHT }}
    >
      {bgUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${bgUrl}")` }}
        />
      ) : (
        <div className="absolute inset-0 bg-surface-raised" />
      )}
      <div className="absolute inset-0 bg-surface-deep/60" />
      <div className="relative flex h-full flex-col justify-between p-2.5">
        <div>
          <p className="line-clamp-1 text-[14px] leading-relaxed tracking-wide text-text-primary">
            {data.title}
          </p>
          <p className="line-clamp-1 text-[12px] tracking-wide text-text-secondary">
            {data.artist}
          </p>
        </div>
        <p className="text-[12px] text-text-dim">mapped by {data.creator}</p>
      </div>
    </div>
  )
})

export const PlaceholderCard = memo(function PlaceholderCard(): React.JSX.Element {
  return (
    <div className="h-25 animate-pulse rounded-lg bg-surface-raised ring-1 ring-border-subtle" />
  )
})
