import { useEffect, useState } from 'react'
import { IconCopy, IconMinus, IconSettings2, IconSquare, IconX } from '@tabler/icons-react'
import stableIcon from '../assets/icon.png'
import canaryIcon from '../assets/icon-canary.png'

const rawVersion = import.meta.env.VITE_APP_VERSION
const isCanary = import.meta.env.VITE_IS_CANARY
const isDev = import.meta.env.DEV

const appIcon = isCanary ? canaryIcon : stableIcon
const displayVersion = `v${isDev ? rawVersion.replace('canary', 'local') : rawVersion}`
const badgeLabel = isDev ? 'local' : isCanary ? 'canary' : null

type TitleBarProps = {
  onOpenSettings?: () => void
}

export function TitleBar({ onOpenSettings }: TitleBarProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized)
    return window.api.window.onMaximizeChanged(setIsMaximized)
  }, [])

  return (
    <div className="drag flex h-8 items-center bg-surface-darker text-text-primary">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <img src={appIcon} width={18} height={18} draggable={false} className="shrink-0" />
        <span className="text-sm font-medium text-text-primary">osu! mapping utility</span>
        <span className="text-xs text-text-muted">{displayVersion}</span>
        {badgeLabel && (
          <span className="rounded bg-canary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-canary">
            {badgeLabel}
          </span>
        )}
      </div>

      <div className="no-drag flex h-full items-center">
        <button
          onClick={onOpenSettings}
          className="flex h-full w-10 items-center justify-center text-text-dim transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          <IconSettings2 size={15} stroke={1.5} />
        </button>
        <div className="mx-1 h-4 w-px bg-border-subtle" />
        <button
          onClick={() => window.api.window.minimize()}
          className="flex h-full w-10 items-center justify-center text-text-dim transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          <IconMinus size={14} stroke={1.5} />
        </button>
        <button
          onClick={() => window.api.window.toggleMaximize()}
          className="flex h-full w-10 items-center justify-center text-text-dim transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          {isMaximized ? (
            <IconCopy size={14} stroke={1.5} />
          ) : (
            <IconSquare size={14} stroke={1.5} />
          )}
        </button>
        <button
          onClick={() => window.api.window.close()}
          className="flex h-full w-10 items-center justify-center text-danger transition-colors hover:bg-danger/10"
        >
          <IconX size={18} stroke={2} />
        </button>
      </div>
    </div>
  )
}
