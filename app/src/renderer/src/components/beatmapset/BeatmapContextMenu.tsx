import { memo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconDownload, IconFolder, IconMessageCircle, IconWorld } from '@tabler/icons-react'

interface BeatmapContextMenuProps {
  x: number
  y: number
  isSubmitted: boolean
  onOpenFolder: () => void
  onOpenWebPage: () => void
  onOpenDiscussion: () => void
  onOpenDirect: () => void
  onClose: () => void
}

export const BeatmapContextMenu = memo(function BeatmapContextMenu({
  x,
  y,
  isSubmitted,
  onOpenFolder,
  onOpenWebPage,
  onOpenDiscussion,
  onOpenDirect,
  onClose
}: BeatmapContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const items = [
    {
      onClick: onOpenFolder,
      icon: <IconFolder size={14} stroke={1.5} />,
      label: 'Open folder',
      disabled: false
    },
    {
      onClick: onOpenWebPage,
      icon: <IconWorld size={14} stroke={1.5} />,
      label: 'Open on osu!',
      disabled: !isSubmitted
    },
    {
      onClick: onOpenDiscussion,
      icon: <IconMessageCircle size={14} stroke={1.5} />,
      label: 'Discussion',
      disabled: !isSubmitted
    },
    {
      onClick: onOpenDirect,
      icon: <IconDownload size={14} stroke={1.5} />,
      label: 'osu!direct',
      disabled: !isSubmitted
    }
  ]

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-2xl"
      style={{ left: x, top: y }}
    >
      {items.map(({ onClick, icon, label, disabled }) => (
        <button
          key={label}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
            disabled
              ? 'cursor-not-allowed text-text-muted opacity-40'
              : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
          }`}
        >
          <span className="shrink-0">{icon}</span>
          {label}
        </button>
      ))}
    </div>,
    document.body
  )
})
