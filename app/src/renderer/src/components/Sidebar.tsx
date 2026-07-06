import { useState } from 'react'
import {
  IconAdjustments,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconHeadphones,
  IconSlideshow,
  IconTags,
  IconDownload
} from '@tabler/icons-react'

export type SidebarKey =
  | 'mapset_cloner'
  | 'mapset_tweaker'
  | 'metadata_editor'
  | 'audio_inspector'
  | 'offset_calibrator'
  | 'media_downloader'

type SidebarItem = {
  key: SidebarKey
  label: string
  icon: React.ReactNode
}

type SidebarCategory = {
  title: string
  items: SidebarItem[]
}

const CATEGORIES: SidebarCategory[] = [
  {
    title: 'Map Tools',
    items: [
      { key: 'mapset_cloner', label: 'Mapset Cloner', icon: <IconCopy size={18} stroke={1.5} /> },
      {
        key: 'mapset_tweaker',
        label: 'Mapset Tweaker',
        icon: <IconAdjustments size={18} stroke={1.5} />
      },
      {
        key: 'metadata_editor',
        label: 'Metadata Editor',
        icon: <IconTags size={18} stroke={1.5} />
      },
      {
        key: 'audio_inspector',
        label: 'Audio Inspector',
        icon: <IconHeadphones size={18} stroke={1.5} />
      },
      {
        key: 'offset_calibrator',
        label: 'Offset Calibrator',
        icon: <IconSlideshow size={18} stroke={1.5} />
      }
    ]
  },
  {
    title: 'Utilities',
    items: [
      {
        key: 'media_downloader',
        label: 'Media Downloader',
        icon: <IconDownload size={18} stroke={1.5} />
      }
    ]
  }
]

type SidebarProps = {
  active?: SidebarKey
  onChange?: (key: SidebarKey) => void
}

export function Sidebar({ active = 'mapset_cloner', onChange }: SidebarProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-dark transition-[width] duration-300 ease-in-out ${
        isExpanded ? 'w-52' : 'w-14'
      }`}
    >
      <div className="border-b border-border-subtle p-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex h-8 w-full items-center justify-center rounded-md text-text-dim transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          {isExpanded ? (
            <IconChevronLeft size={16} stroke={1.5} />
          ) : (
            <IconChevronRight size={16} stroke={1.5} />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-1.5 py-2">
        {CATEGORIES.map((category, i) => (
          <div key={category.title}>
            {i > 0 && (
              <div
                className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
                  !isExpanded ? 'max-h-6 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="mx-auto mb-3 h-px w-6 bg-border-subtle" />
              </div>
            )}
            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
                isExpanded ? 'max-h-8 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <p className="mb-1 whitespace-nowrap px-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                {category.title}
              </p>
            </div>
            <div className="space-y-0.5">
              {category.items.map(({ key, label, icon }) => {
                const isActive = active === key
                return (
                  <button
                    key={key}
                    onClick={() => onChange?.(key)}
                    title={!isExpanded ? label : undefined}
                    className={`flex h-9 w-full items-center gap-2.5 rounded-md transition-[background-color,color,padding-left] duration-300 ease-in-out ${
                      isExpanded ? 'pl-2' : 'pl-3.25'
                    } pr-2 ${
                      isActive
                        ? 'bg-surface-raised text-text-primary'
                        : 'text-text-dim hover:bg-surface hover:text-text-secondary'
                    }`}
                  >
                    <span className={`shrink-0 ${isActive ? 'text-primary' : ''}`}>{icon}</span>
                    <span
                      className={`overflow-hidden whitespace-nowrap text-xs font-medium transition-[max-width,opacity] duration-300 ease-in-out ${
                        isExpanded ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0'
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
